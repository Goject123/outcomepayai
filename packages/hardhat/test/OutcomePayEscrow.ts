// @ts-nocheck
import { expect } from "chai";
import { network } from "hardhat";
import type { BaseContract } from "ethers";
import type { Abi_MockUSDC } from "../generated/abis/MockUSDC.js";
import type { Abi_OutcomePayEscrow } from "../generated/abis/OutcomePayEscrow.js";
import { loadAndExecuteDeploymentsFromFiles } from "../rocketh/environment.js";

const { provider, networkHelpers, ethers } = await network.create();

const amount = 10n * 1_000_000n;
const intentHash = ethers.id("buyer wants a subscription contract deployed");
const proofHash = ethers.id("contract address and deployment tx hash");
const passVerificationHash = ethers.id("verification passed");
const failVerificationHash = ethers.id("verification failed");

type AnyContract = BaseContract & Record<string, any>;

async function deployFixture() {
  const env = await loadAndExecuteDeploymentsFromFiles({ provider });
  const [buyer, providerAgent, verifier] = await ethers.getSigners();

  const { address: tokenAddress, abi: tokenAbi } = env.get<Abi_MockUSDC>("MockUSDC");
  const { address: escrowAddress, abi: escrowAbi } = env.get<Abi_OutcomePayEscrow>("OutcomePayEscrow");

  const token = (await ethers.getContractAt(tokenAbi, tokenAddress)) as AnyContract;
  const escrow = (await ethers.getContractAt(escrowAbi, escrowAddress)) as AnyContract;

  await token.mint(buyer.address, amount * 10n);
  await escrow.grantRole(await escrow.VERIFIER_ROLE(), verifier.address);

  return { buyer, providerAgent, verifier, token, escrow };
}

async function createAndFund() {
  const fixture = await networkHelpers.loadFixture(deployFixture);
  const { buyer, providerAgent, token, escrow } = fixture;
  const deadline = (await networkHelpers.time.latest()) + 3600;

  await escrow.connect(buyer).createSettlement(providerAgent.address, await token.getAddress(), amount, deadline, intentHash);
  await token.connect(buyer).approve(await escrow.getAddress(), amount);
  await escrow.connect(buyer).fundEscrow(1n);

  return fixture;
}

describe("OutcomePayEscrow", function () {
  it("creates and funds a settlement", async function () {
    const { buyer, providerAgent, token, escrow } = await createAndFund();

    const settlement = await escrow.getSettlement(1n);
    expect(settlement.buyer).to.equal(buyer.address);
    expect(settlement.provider).to.equal(providerAgent.address);
    expect(settlement.amount).to.equal(amount);
    expect(settlement.status).to.equal(1n);
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount);
  });

  it("releases payment after a passing verification", async function () {
    const { providerAgent, verifier, token, escrow } = await createAndFund();

    await escrow.connect(providerAgent).submitProof(1n, proofHash);
    await escrow.connect(verifier).recordVerification(1n, 1, passVerificationHash);
    await expect(escrow.connect(verifier).releasePayment(1n)).to.emit(escrow, "OutcomeReceiptCreated");

    const settlement = await escrow.getSettlement(1n);
    expect(settlement.status).to.equal(3n);
    expect(await token.balanceOf(providerAgent.address)).to.equal(amount);
  });

  it("refunds buyer after a failed verification", async function () {
    const { buyer, providerAgent, verifier, token, escrow } = await createAndFund();
    const buyerBalanceBeforeRefund = await token.balanceOf(buyer.address);

    await escrow.connect(providerAgent).submitProof(1n, proofHash);
    await escrow.connect(verifier).recordVerification(1n, 2, failVerificationHash);
    await escrow.connect(verifier).refundBuyer(1n);

    const settlement = await escrow.getSettlement(1n);
    expect(settlement.status).to.equal(4n);
    expect(await token.balanceOf(buyer.address)).to.equal(buyerBalanceBeforeRefund + amount);
  });

  it("prevents non-provider proof submission", async function () {
    const { buyer, escrow } = await createAndFund();

    await expect(escrow.connect(buyer).submitProof(1n, proofHash)).to.be.revertedWithCustomError(
      escrow,
      "UnauthorizedCaller",
    );
  });
});
