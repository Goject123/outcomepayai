"use client";

import { useMemo, useState } from "react";
import { Address } from "@scaffold-ui/components";
import { Address as AddressType, formatUnits, isAddress, keccak256, stringToHex } from "viem";
import { useAccount } from "wagmi";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  CheckBadgeIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon,
  DocumentCheckIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import {
  useDeployedContractInfo,
  useScaffoldReadContract,
  useScaffoldWriteContract,
  useTargetNetwork,
} from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const DEMO_AMOUNT = 10_000_000n;
const FAUCET_AMOUNT = 1_000_000_000n;
const SETTLEMENT_ID = 1n;
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000" as const;
const DEFAULT_DEMO_CONTRACT = "0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0";
const DEFAULT_DEMO_TX = "0xb06ecb8eb9fedea57ddb589816b0dc82f240f65c0f8fb71d7201bce39b7a787e";
const DEFAULT_OWNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const LOCAL_EXPLORER_TX = `/blockexplorer/transaction/${DEFAULT_DEMO_TX}`;
const LOCAL_EXPLORER_CONTRACT = `/blockexplorer/address/${DEFAULT_DEMO_CONTRACT}`;

const hashText = (value: string) => keccak256(stringToHex(value));

type VerifyResponse = {
  result: "PASS" | "FAIL" | "DISPUTE";
  verificationHash: `0x${string}`;
  checks: {
    contractExists: boolean;
    txValid: boolean;
    ownerMatches: boolean;
    priceMatches: boolean;
  };
  reason: string;
};
type GuidedStep = "create" | "fund" | "proof" | "verify" | "settle";
type DemoMode = "product" | "live";
type DemoPlayback = "idle" | "active" | "complete";

const statusLabels = ["Created", "Funded", "Proof Submitted", "Released", "Refunded", "Disputed"];
const guidedSteps: Array<{ key: GuidedStep; label: string; short: string }> = [
  { key: "create", label: "Create settlement", short: "Create" },
  { key: "fund", label: "Fund escrow", short: "Fund" },
  { key: "proof", label: "Submit proof", short: "Proof" },
  { key: "verify", label: "Verify outcome", short: "Verify" },
  { key: "settle", label: "Settle + receipt", short: "Settle" },
];
const checkLabels: Record<keyof VerifyResponse["checks"], string> = {
  contractExists: "Contract bytecode exists",
  txValid: "Deployment tx is valid",
  ownerMatches: "Owner matches expected buyer",
  priceMatches: "Plan price is 10 mUSDC",
};
const DEFAULT_VERIFY_RESULT: VerifyResponse = {
  result: "PASS",
  verificationHash: hashText(
    JSON.stringify({
      result: "PASS",
      contractAddress: DEFAULT_DEMO_CONTRACT,
      txHash: DEFAULT_DEMO_TX,
      owner: DEFAULT_OWNER,
      price: "10000000",
    }),
  ),
  checks: {
    contractExists: true,
    txValid: true,
    ownerMatches: true,
    priceMatches: true,
  },
  reason: "Payment can be released. The submitted deployment proof matches the agreed onchain outcome.",
};

const shortHash = (value?: string) => (value ? `${value.slice(0, 10)}...${value.slice(-8)}` : "pending");
const scrollToSection = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const statusClass = (status?: string) => {
  if (status === "Released") return "bg-[#dff2e7] text-[#18513f]";
  if (status === "Refunded") return "bg-[#f8e5de] text-[#8d321e]";
  if (status === "Disputed") return "bg-[#fff2c7] text-[#6f5516]";
  return "bg-[#ece6d8] text-[#4d5954]";
};

export const OutcomePayDemo = () => {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const [providerAddress, setProviderAddress] = useState("");
  const [submittedContract, setSubmittedContract] = useState(DEFAULT_DEMO_CONTRACT);
  const [submittedTxHash, setSubmittedTxHash] = useState(DEFAULT_DEMO_TX);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(DEFAULT_VERIFY_RESULT);
  const [guidedStep, setGuidedStep] = useState<GuidedStep>("verify");
  const [demoMode, setDemoMode] = useState<DemoMode>("product");
  const [demoProgress, setDemoProgress] = useState(4);
  const [demoPlayback, setDemoPlayback] = useState<DemoPlayback>("idle");
  const [isVerifying, setIsVerifying] = useState(false);
  const [receiptPulse, setReceiptPulse] = useState(false);

  const intentHash = useMemo(
    () => hashText("Deploy DemoSubscription with owner matching Buyer Agent and planPrice 10 mUSDC"),
    [],
  );
  const proofHash = useMemo(
    () =>
      submittedContract && submittedTxHash
        ? hashText(`${submittedContract.toLowerCase()}:${submittedTxHash.toLowerCase()}`)
        : hashText("pending-proof"),
    [submittedContract, submittedTxHash],
  );

  const { data: demoOwner } = useScaffoldReadContract({
    contractName: "DemoSubscription",
    functionName: "owner",
  });
  const { data: mockUSDC } = useDeployedContractInfo({ contractName: "MockUSDC" });
  const { data: escrowInfo } = useDeployedContractInfo({ contractName: "OutcomePayEscrow" });
  const { data: tokenBalance } = useScaffoldReadContract({
    contractName: "MockUSDC",
    functionName: "balanceOf",
    args: [connectedAddress],
  });
  const { data: settlement } = useScaffoldReadContract({
    contractName: "OutcomePayEscrow",
    functionName: "getSettlement",
    args: [SETTLEMENT_ID],
  });

  const { writeContractAsync: writeTokenAsync, isMining: isTokenMining } = useScaffoldWriteContract({
    contractName: "MockUSDC",
  });
  const { writeContractAsync: writeEscrowAsync, isMining: isEscrowMining } = useScaffoldWriteContract({
    contractName: "OutcomePayEscrow",
  });

  const isBusy = isTokenMining || isEscrowMining || isVerifying;
  const currentStatus = settlement?.status === undefined ? "Not created" : statusLabels[Number(settlement.status)];
  const displayProvider = providerAddress || connectedAddress;
  const receiptStatus =
    currentStatus === "Not created" && verifyResult?.result === "PASS"
      ? "Receipt Ready"
      : currentStatus === "Not created"
        ? "Awaiting settlement"
        : currentStatus;
  const balanceLabel = tokenBalance === undefined ? "Connect wallet" : `${formatUnits(tokenBalance, 6)} mUSDC`;
  const liveWalletLabel = connectedAddress ? shortHash(connectedAddress) : "Connect Wallet";
  const liveNetworkLabel = targetNetwork.name || (targetNetwork.id === 31337 ? "Hardhat" : `Chain ${targetNetwork.id}`);
  const verificationState = verifyResult?.result || "PENDING";
  const displayedVerificationState = demoMode === "product" ? "PASS" : verificationState;
  const receiptHash =
    settlement?.verificationHash === ZERO_BYTES32
      ? verifyResult?.verificationHash
      : settlement?.verificationHash || verifyResult?.verificationHash;
  const settlementOutcome =
    demoMode === "product"
      ? "Payment Released"
      : currentStatus === "Released"
        ? "Payment Released"
        : verifyResult?.result === "PASS"
          ? "Payment can be released"
          : verifyResult?.result === "FAIL"
            ? "Refund buyer"
            : verifyResult?.result === "DISPUTE"
              ? "Open dispute"
              : currentStatus === "Refunded"
                ? "Buyer Refunded"
                : currentStatus === "Disputed"
                  ? "Dispute Open"
                  : "Awaiting Verification";

  const switchMode = (mode: DemoMode) => {
    setDemoMode(mode);
    if (mode === "product") {
      setGuidedStep("verify");
      setDemoProgress(4);
      setDemoPlayback("idle");
      setVerifyResult(DEFAULT_VERIFY_RESULT);
    } else {
      setGuidedStep("create");
      setDemoPlayback("idle");
    }
  };

  const startProductDemo = () => {
    setDemoMode("product");
    setGuidedStep("create");
    setDemoProgress(-1);
    setDemoPlayback("active");
    setVerifyResult(null);
    scrollToSection("demo");
  };

  const advanceProductStep = () => {
    const currentIndex = guidedSteps.findIndex(step => step.key === guidedStep);
    const completedIndex = Math.max(currentIndex, demoProgress);
    setDemoProgress(completedIndex);

    if (guidedStep === "verify" || guidedStep === "settle") setVerifyResult(DEFAULT_VERIFY_RESULT);
    if (guidedStep === "settle") {
      setDemoPlayback("complete");
      highlightReceipt();
      return;
    }

    const nextIndex = Math.min(currentIndex + 1, guidedSteps.length - 1);
    const nextStep = guidedSteps[nextIndex];
    setGuidedStep(nextStep.key);
    setDemoPlayback("active");
  };

  const createSettlement = async () => {
    const selectedProvider = providerAddress || connectedAddress;
    if (!selectedProvider || !isAddress(selectedProvider)) {
      notification.error("Connect a wallet or enter a Provider Agent address");
      return;
    }
    if (!mockUSDC?.address) {
      notification.error("MockUSDC is not deployed yet");
      return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60);
    await writeEscrowAsync({
      functionName: "createSettlement",
      args: [selectedProvider as AddressType, mockUSDC.address, DEMO_AMOUNT, deadline, intentHash],
    });
    setGuidedStep("fund");
  };

  const highlightReceipt = () => {
    setReceiptPulse(true);
    window.setTimeout(() => setReceiptPulse(false), 1800);
    window.setTimeout(() => scrollToSection("receipt"), 80);
  };

  const mintDemoTokens = async () => {
    if (!connectedAddress) {
      notification.error("Connect a wallet first");
      return;
    }
    await writeTokenAsync({
      functionName: "faucet",
      args: [connectedAddress, FAUCET_AMOUNT],
    });
  };

  const fundEscrow = async () => {
    if (!escrowInfo?.address) {
      notification.error("OutcomePayEscrow is not deployed yet");
      return;
    }
    await writeTokenAsync({ functionName: "approve", args: [escrowInfo.address, DEMO_AMOUNT] });
    await writeEscrowAsync({ functionName: "fundEscrow", args: [SETTLEMENT_ID] });
    setGuidedStep("proof");
  };

  const submitProof = async () => {
    await writeEscrowAsync({ functionName: "submitProof", args: [SETTLEMENT_ID, proofHash] });
    setGuidedStep("verify");
  };

  const verifyOutcome = async () => {
    setIsVerifying(true);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: submittedContract,
          txHash: submittedTxHash,
          buyer: connectedAddress,
          expectedOwner: demoOwner ? String(demoOwner) : connectedAddress,
          expectedPrice: DEMO_AMOUNT.toString(),
        }),
      });
      const data = (await response.json()) as VerifyResponse;
      if (!response.ok) throw new Error(data.reason || "Verification failed");
      setVerifyResult(data);
      setGuidedStep("settle");
      highlightReceipt();
      notification.success(`Verification ${data.result}`);
    } catch (error) {
      notification.error(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const tryInvalidProof = () => {
    setVerifyResult({
      result: "FAIL",
      verificationHash: hashText(`invalid-proof:${submittedContract}:${submittedTxHash}`),
      checks: {
        contractExists: true,
        txValid: true,
        ownerMatches: false,
        priceMatches: true,
      },
      reason:
        "Owner mismatch. Buyer should be refunded because the submitted contract does not match the agreed buyer.",
    });
    setGuidedStep("settle");
    highlightReceipt();
  };

  const copyReceiptHash = async () => {
    if (!receiptHash) {
      notification.error("Receipt hash is not ready yet");
      return;
    }
    await navigator.clipboard.writeText(receiptHash);
    notification.success("Receipt hash copied");
  };

  const recordAndSettle = async () => {
    if (!verifyResult) {
      notification.error("Run verification first");
      return;
    }

    const resultCode = verifyResult.result === "PASS" ? 1 : verifyResult.result === "FAIL" ? 2 : 3;
    await writeEscrowAsync({
      functionName: "recordVerification",
      args: [SETTLEMENT_ID, resultCode, verifyResult.verificationHash],
    });

    if (verifyResult.result === "PASS") {
      await writeEscrowAsync({ functionName: "releasePayment", args: [SETTLEMENT_ID] });
    } else if (verifyResult.result === "FAIL") {
      await writeEscrowAsync({ functionName: "refundBuyer", args: [SETTLEMENT_ID] });
    } else {
      await writeEscrowAsync({ functionName: "raiseDispute", args: [SETTLEMENT_ID, verifyResult.verificationHash] });
    }
    setGuidedStep("settle");
    highlightReceipt();
  };

  const demoSteps = [
    {
      label: "1. Create settlement",
      detail: "Open settlement for a verifiable onchain outcome.",
      icon: ClipboardDocumentCheckIcon,
    },
    {
      label: "2. Lock funds",
      detail: "10 mUSDC moves into escrow.",
      icon: BanknotesIcon,
    },
    {
      label: "3. Submit proof",
      detail: "Provider submits contract and tx hash.",
      icon: DocumentCheckIcon,
    },
    {
      label: "4. Verify outcome",
      detail: "Check bytecode, tx receipt, owner, and price.",
      icon: ShieldCheckIcon,
    },
    {
      label: "5. Settle + receipt",
      detail: "Release, refund, or dispute.",
      icon: CheckBadgeIcon,
    },
  ];

  return (
    <main className="min-h-screen bg-[#f4f1e8] text-[#171d1b]">
      <section className="border-b border-[#d6cebd] bg-[#fffdf7]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div className="flex flex-col justify-center py-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="border border-[#23665a] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#23665a]">
                Arbitrum agent commerce
              </span>
              <span className={`px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${statusClass(currentStatus)}`}>
                {receiptStatus}
              </span>
              <span className="border border-[#202c5f] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#202c5f]">
                Live on Arbitrum Sepolia
              </span>
            </div>

            <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[0.98] tracking-normal text-[#101514] md:text-7xl">
              AI agents should not pay for promises.
            </h1>
            <p className="mt-5 max-w-2xl text-xl font-medium leading-8 text-[#43504b]">
              They should pay for verified onchain outcomes.
            </p>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#4d5954]">
              Verified settlement for AI agents buying onchain work on Arbitrum.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <button className="bg-[#23665a] px-5 py-3 text-sm font-black text-white" onClick={startProductDemo}>
                Start guided demo
              </button>
              <button
                className="border border-[#23665a] px-5 py-3 text-sm font-black text-[#23665a]"
                onClick={() => scrollToSection("receipt")}
              >
                View Receipt Example
              </button>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <Metric label="Escrow amount" value="10 mUSDC" tone="green" />
              <Metric label="Wallet" value={connectedAddress ? "Connected" : "Ready to connect"} tone="rust" />
              <Metric
                label="Verification"
                value={displayedVerificationState}
                tone={displayedVerificationState === "PASS" ? "green" : "ink"}
              />
            </div>
          </div>

          <div className="bg-[#101716] p-5 text-[#fdfbf6] shadow-2xl">
            <div className="border border-[#33413e] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#9dc4b9]">Settlement route</p>
                  <h2 className="mt-2 text-2xl font-semibold">Promise to proof to payment</h2>
                </div>
                <div className="bg-[#e6b45e] px-3 py-2 text-sm font-black text-[#101716]">LIVE</div>
              </div>
              <div className="mt-5 space-y-3">
                {demoSteps.map(step => {
                  const Icon = step.icon;
                  return (
                    <div
                      key={step.label}
                      className="grid grid-cols-[40px_1fr] gap-3 border border-[#2b3735] bg-[#17201e] p-3"
                    >
                      <div className="flex h-10 w-10 items-center justify-center bg-[#23302d] text-[#e6b45e]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{step.label}</div>
                        <div className="mt-1 text-sm leading-5 text-[#b9c8c2]">{step.detail}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#d8d1c2] bg-[#fffdf7]">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-6 md:grid-cols-4 lg:px-8">
          <FlowCard label="Buyer Agent" value="Escrows 10 mUSDC" />
          <FlowCard label="OutcomePay Escrow" value="Holds funds until proof is verified" />
          <FlowCard label="Provider Agent" value="Submits contract + tx hash proof" />
          <FlowCard label="Outcome Receipt" value="Records PASS, release, refund, or dispute" />
        </div>
      </section>

      <section id="demo" className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#23665a]">Live demo</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">Guided settlement flow</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-[#4d5954]">
            Default mode plays the whole story without wallet risk. Live mode keeps the real wallet flow for judges who
            want to inspect the contracts.
          </p>
        </div>

        <Panel title="Agent settlement console">
          <div className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <ModeButton
              active={demoMode === "product"}
              title="Product Demo Mode"
              body="No wallet required. Shows the complete settlement story."
              onClick={() => switchMode("product")}
            />
            <ModeButton
              active={demoMode === "live"}
              title="Live Wallet Flow"
              body="Connect wallet and send transactions on the configured network."
              onClick={() => switchMode("live")}
            />
            <button
              className="border border-[#23665a] bg-[#23665a] px-4 py-3 text-sm font-black text-white disabled:opacity-70"
              disabled={demoPlayback === "active"}
              onClick={startProductDemo}
            >
              {demoPlayback === "active"
                ? "Demo in progress"
                : demoPlayback === "complete"
                  ? "Restart Demo"
                  : "Start Demo"}
            </button>
          </div>

          <div
            className={
              demoPlayback === "complete"
                ? "mb-5 border border-[#1f8a5b] bg-[#edf8f1] p-4"
                : demoPlayback === "active"
                  ? "mb-5 border border-[#d9a441] bg-[#fff4cf] p-4"
                  : "mb-5 border border-[#d8d1c2] bg-[#fffdf7] p-4"
            }
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#68736f]">
                  {demoPlayback === "complete"
                    ? "Demo complete"
                    : demoPlayback === "active"
                      ? "Guided demo active"
                      : "Fast path for judges"}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#4d5954]">
                  {demoPlayback === "complete"
                    ? "PASS verified, payment released, and Outcome Receipt created."
                    : demoPlayback === "active"
                      ? "Confirm each settlement step. The receipt becomes meaningful because the state accumulates."
                      : "Start the guided demo, confirm each step, then open the Outcome Receipt. Wallet testing is optional."}
                </p>
              </div>
              <button
                className="border border-[#23665a] px-3 py-2 text-xs font-black text-[#23665a]"
                onClick={() => scrollToSection("receipt")}
              >
                View Receipt
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {guidedSteps.map((step, index) => (
              <StepTab
                key={step.key}
                index={index + 1}
                label={step.short}
                active={guidedStep === step.key}
                complete={
                  demoMode === "product"
                    ? demoProgress > index
                    : guidedSteps.findIndex(item => item.key === guidedStep) > index
                }
                onClick={() => setGuidedStep(step.key)}
              />
            ))}
          </div>

          <div className="mt-7 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
            <div className="space-y-4">
              <StatusTile label="Network" value={demoMode === "live" ? liveNetworkLabel : "Arbitrum Sepolia"} />
              <StatusTile label="Escrow amount" value="10 mUSDC" />
              <StatusTile label="Mode" value={demoMode === "product" ? "Product Demo" : "Live Wallet"} />
              {demoMode === "live" && <StatusTile label="Wallet" value={liveWalletLabel} />}
              <StatusTile label="Verification" value={displayedVerificationState} />
              <StatusTile label="Settlement" value={settlementOutcome} />
              {demoMode === "live" && (
                <div className="border border-[#d8d1c2] bg-[#fffdf7] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#68736f]">Live flow setup</div>
                  <div className="mt-3 space-y-2 text-sm leading-5 text-[#4d5954]">
                    <p>
                      1. Click <span className="font-black text-[#07110e]">Connect Wallet</span> for a real wallet.
                    </p>
                    <p>2. Local testing can use the smaller Demo Wallet shortcut.</p>
                    <p>3. Mint demo mUSDC, then follow Create to Settle.</p>
                  </div>
                </div>
              )}
              {demoMode === "product" && (
                <div className="border border-[#d8d1c2] bg-[#fffdf7] p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-[#68736f]">Settlement state</div>
                  <div className="mt-3 space-y-2">
                    <StateLine active={demoProgress >= 0} label="Settlement created" />
                    <StateLine active={demoProgress >= 1} label="10 mUSDC escrowed" />
                    <StateLine active={demoProgress >= 2} label="Proof attached" />
                    <StateLine active={demoProgress >= 3} label="Onchain checks PASS" />
                    <StateLine active={demoProgress >= 4} label="Receipt ready" />
                  </div>
                </div>
              )}
            </div>

            <div className="border border-[#d8d1c2] bg-[#fffdf7] p-5">
              {guidedStep === "create" && (
                <StepContent
                  eyebrow="Step 1"
                  title="Create settlement"
                  body="Buyer Agent opens a settlement for a verifiable onchain outcome."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-[#68736f]">Buyer Agent</p>
                      <Address address={connectedAddress} chain={targetNetwork} />
                    </div>
                    <Field
                      label="Provider Agent address"
                      value={providerAddress}
                      onChange={setProviderAddress}
                      placeholder="Defaults to connected wallet"
                    />
                  </div>
                  {demoMode === "product" ? (
                    <ActionButton disabled={false} onClick={advanceProductStep} variant="green">
                      Confirm Settlement
                    </ActionButton>
                  ) : (
                    <ActionButton disabled={isBusy} onClick={createSettlement} variant="green">
                      Create Settlement
                    </ActionButton>
                  )}
                </StepContent>
              )}

              {guidedStep === "fund" && (
                <StepContent eyebrow="Step 2" title="Fund escrow" body="Lock funds before the provider receives money.">
                  <div className="grid gap-4 md:grid-cols-2">
                    <StatusTile label="Buyer balance" value={balanceLabel} />
                    <StatusTile label="Escrow contract" value={shortHash(escrowInfo?.address)} />
                  </div>
                  {demoMode === "product" ? (
                    <ActionButton disabled={false} onClick={advanceProductStep} variant="rust">
                      Confirm Escrow Funding
                    </ActionButton>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      <ActionButton disabled={isBusy} onClick={mintDemoTokens} variant="outline">
                        Mint Demo mUSDC
                      </ActionButton>
                      <ActionButton disabled={isBusy} onClick={fundEscrow} variant="rust">
                        Approve + Fund
                      </ActionButton>
                    </div>
                  )}
                </StepContent>
              )}

              {guidedStep === "proof" && (
                <StepContent
                  eyebrow="Step 3"
                  title="Submit proof"
                  body="Provider Agent submits the deployed contract and transaction hash as machine-checkable proof."
                >
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Field
                      label="Submitted contract"
                      value={submittedContract}
                      onChange={setSubmittedContract}
                      placeholder="0x contract address"
                    />
                    <Field
                      label="Deployment tx hash"
                      value={submittedTxHash}
                      onChange={setSubmittedTxHash}
                      placeholder="0x tx hash"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    <ExplorerLink href={LOCAL_EXPLORER_CONTRACT}>View contract on explorer</ExplorerLink>
                    <ExplorerLink href={LOCAL_EXPLORER_TX}>View tx on explorer</ExplorerLink>
                  </div>
                  {demoMode === "product" ? (
                    <ActionButton disabled={false} onClick={advanceProductStep} variant="ink">
                      Confirm Proof
                    </ActionButton>
                  ) : (
                    <ActionButton disabled={isBusy} onClick={submitProof} variant="ink">
                      Submit Proof
                    </ActionButton>
                  )}
                </StepContent>
              )}

              {guidedStep === "verify" && (
                <StepContent
                  eyebrow="Step 4"
                  title="Verify outcome"
                  body="OutcomePay checks bytecode, tx receipt, owner, and plan price before funds can move."
                >
                  <div className="grid gap-3 md:grid-cols-4">
                    {(Object.keys(checkLabels) as Array<keyof VerifyResponse["checks"]>).map(key => {
                      const passed = demoMode === "product" ? true : verifyResult?.checks[key];
                      return (
                        <div key={key} className="border border-[#d8d1c2] bg-white p-4">
                          <div
                            className={
                              passed ? "text-sm font-black text-[#23665a]" : "text-sm font-black text-[#8d321e]"
                            }
                          >
                            {passed ? "PASS" : verifyResult ? "FAIL" : "PENDING"}
                          </div>
                          <div className="mt-2 min-h-10 text-sm leading-5 text-[#4d5954]">{checkLabels[key]}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 md:flex-row">
                    <ActionButton
                      disabled={isBusy}
                      onClick={demoMode === "product" ? advanceProductStep : verifyOutcome}
                      variant="dark"
                    >
                      {isVerifying ? (
                        <ArrowPathIcon className="inline h-4 w-4 animate-spin" />
                      ) : demoMode === "product" ? (
                        "Confirm Verification"
                      ) : (
                        "Run Verify"
                      )}
                    </ActionButton>
                    <ActionButton disabled={isBusy} onClick={tryInvalidProof} variant="outline">
                      Try Invalid Proof
                    </ActionButton>
                  </div>
                </StepContent>
              )}

              {guidedStep === "settle" && (
                <StepContent
                  eyebrow="Step 5"
                  title="Settle + create receipt"
                  body="The verifier decision determines release, refund, or dispute. The receipt explains why money moved."
                >
                  <DecisionBlock
                    result={displayedVerificationState}
                    outcome={settlementOutcome}
                    reason={verifyResult?.reason || DEFAULT_VERIFY_RESULT.reason}
                  />
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <CloseoutStep
                      label="1"
                      title={displayedVerificationState}
                      body="Verification result is attached to the settlement."
                      active={Boolean(verifyResult)}
                    />
                    <CloseoutStep
                      label="2"
                      title={settlementOutcome}
                      body="Escrow follows the verified decision."
                      active={Boolean(verifyResult)}
                    />
                    <CloseoutStep
                      label="3"
                      title="Receipt Created"
                      body="Proof, decision, settlement, and hashes become a shareable record."
                      active={Boolean(verifyResult)}
                    />
                  </div>
                  {demoMode === "product" ? (
                    <ActionButton disabled={false} onClick={highlightReceipt} variant="green">
                      Open Receipt
                    </ActionButton>
                  ) : (
                    <ActionButton disabled={isBusy || !verifyResult} onClick={recordAndSettle} variant="green">
                      Settle + Create Receipt
                    </ActionButton>
                  )}
                </StepContent>
              )}
            </div>
          </div>
        </Panel>
      </section>

      <section
        id="receipt"
        className={
          receiptPulse
            ? "border-y border-[#d9a441] bg-[#07110e] text-[#fdfbf6] shadow-[0_0_0_6px_rgba(217,164,65,0.22)_inset] transition-shadow duration-500"
            : "border-y border-[#d8d1c2] bg-[#07110e] text-[#fdfbf6] transition-shadow duration-500"
        }
      >
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 lg:grid-cols-[0.72fr_1.28fr] lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d9a441]">Outcome Receipt</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">The proof people remember.</h2>
            <p className="mt-4 max-w-md text-base leading-7 text-[#b9c8c2]">
              Every settlement records what was requested, what was submitted, what was verified, and why money moved.
            </p>
            <div className="mt-8 space-y-2 text-lg font-black">
              <p>No screenshots.</p>
              <p>No chat promises.</p>
              <p>Only bytecode, tx receipts, and contract state.</p>
            </div>
          </div>

          <div className="border border-[#33413e] bg-[#0d1916] p-6 shadow-2xl">
            <div className="flex flex-col gap-4 border-b border-[#33413e] pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-[#9dc4b9]">Outcome Receipt #001</p>
                <h3 className="mt-2 text-3xl font-black">Deploy Subscription Contract</h3>
              </div>
              <div
                className={
                  verificationState === "PASS"
                    ? "inline-flex items-center gap-2 bg-[#1f8a5b] px-4 py-3 text-lg font-black text-white"
                    : verificationState === "FAIL"
                      ? "inline-flex items-center gap-2 bg-[#c44a35] px-4 py-3 text-lg font-black text-white"
                      : "inline-flex items-center gap-2 bg-[#d9a441] px-4 py-3 text-lg font-black text-[#07110e]"
                }
              >
                <CheckBadgeIcon className="h-5 w-5" />
                {verificationState}
              </div>
            </div>

            <div className="mt-6 grid gap-x-8 gap-y-4 md:grid-cols-2">
              <ReceiptRow label="Network" value="Arbitrum Sepolia" />
              <ReceiptRow label="Settlement" value={settlementOutcome} />
              <ReceiptRow label="Buyer Agent" value={shortHash(connectedAddress || DEFAULT_OWNER)} />
              <ReceiptRow label="Provider Agent" value={shortHash(displayProvider || DEFAULT_OWNER)} />
              <ReceiptRow label="Escrow" value="10 mUSDC" />
              <ReceiptRow label="Submitted contract" value={shortHash(submittedContract)} />
              <ReceiptRow label="Submitted tx" value={shortHash(submittedTxHash)} />
              <ReceiptRow label="Intent hash" value={shortHash(settlement?.intentHash || intentHash)} />
              <ReceiptRow
                label="Proof hash"
                value={shortHash(
                  settlement?.proofHash === ZERO_BYTES32 ? proofHash : settlement?.proofHash || proofHash,
                )}
              />
              <ReceiptRow label="Receipt hash" value={shortHash(receiptHash)} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <ExplorerLink href={LOCAL_EXPLORER_CONTRACT} dark>
                View Contract
              </ExplorerLink>
              <ExplorerLink href={LOCAL_EXPLORER_TX} dark>
                View Tx
              </ExplorerLink>
              <button
                className="inline-flex items-center gap-1 border border-[#e6b45e] px-3 py-2 text-xs font-black text-[#e6b45e]"
                onClick={copyReceiptHash}
              >
                Copy Receipt Hash
                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fffdf7]">
        <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
          <div className="mb-7 max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#23665a]">Why this matters</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">
              Not a task board. Not a payment rail.
            </h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <ProductCard
              title="Not a task board"
              eyebrow="Boundary"
              body="OutcomePay does not match buyers and providers."
            />
            <ProductCard
              title="Not a payment rail"
              eyebrow="Boundary"
              body="OutcomePay starts after agents already agreed on work."
            />
            <ProductCard
              title="It verifies delivery"
              eyebrow="Our layer"
              body="It checks bytecode, tx receipts, ownership, and contract state before settlement."
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#23665a]">Use cases</p>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-5xl">Settlement for agent commerce.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            <ProductCard title="AI buyer agents" eyebrow="Buyer" body="Pay only when onchain work is proven." />
            <ProductCard
              title="Provider agents"
              eyebrow="Provider"
              body="Submit machine-checkable proof of delivery."
            />
            <ProductCard
              title="Agent marketplaces"
              eyebrow="Integration"
              body="Use OutcomePay as the settlement layer."
            />
          </div>
        </div>
      </section>
    </main>
  );
};

const Metric = ({ label, value, tone }: { label: string; value: string; tone: "green" | "rust" | "ink" }) => {
  const colors = {
    green: "border-[#23665a]",
    rust: "border-[#b55235]",
    ink: "border-[#202c5f]",
  };
  return (
    <div className={`border-l-4 bg-white p-4 shadow-sm ${colors[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#68736f]">{label}</div>
      <div className="mt-2 break-words text-lg font-black">{value}</div>
    </div>
  );
};

const FlowCard = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-[#d8d1c2] bg-[#f4f1e8] p-4">
    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#23665a]">{label}</div>
    <div className="mt-3 min-h-12 text-lg font-black leading-tight">{value}</div>
  </div>
);

const Panel = ({ title, children, dark = false }: { title: string; children: React.ReactNode; dark?: boolean }) => (
  <section
    className={
      dark ? "border border-[#2b3735] bg-[#101716] p-5 text-[#fdfbf6]" : "border border-[#d8d1c2] bg-white p-5"
    }
  >
    <h2 className="text-lg font-black">{title}</h2>
    <div className="mt-4">{children}</div>
  </section>
);

const ReceiptRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-start justify-between gap-4 border-b border-[#2b3735] pb-2">
    <span className="text-[#9dc4b9]">{label}</span>
    <span className="break-all text-right font-mono">{value}</span>
  </div>
);

const ExplorerLink = ({
  href,
  children,
  dark = false,
}: {
  href: string;
  children: React.ReactNode;
  dark?: boolean;
}) => (
  <a
    href={href}
    className={
      dark
        ? "inline-flex items-center gap-1 border border-[#e6b45e] px-3 py-2 text-xs font-black text-[#e6b45e]"
        : "inline-flex items-center gap-1 border border-[#23665a] px-3 py-2 text-xs font-black text-[#23665a]"
    }
  >
    {children}
    <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
  </a>
);

const Field = ({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <label className="block">
    <span className="text-sm font-semibold text-[#4d5954]">{label}</span>
    <input
      className="mt-2 w-full border border-[#c9c1b1] bg-[#fffdf7] px-3 py-3 font-mono text-sm outline-none focus:border-[#23665a]"
      placeholder={placeholder}
      value={value}
      onChange={event => onChange(event.target.value)}
    />
  </label>
);

const ActionButton = ({
  children,
  disabled,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
  variant: "green" | "rust" | "ink" | "dark" | "outline";
}) => {
  const styles = {
    green: "bg-[#23665a] text-white",
    rust: "bg-[#b55235] text-white",
    ink: "bg-[#202c5f] text-white",
    dark: "bg-[#101716] text-white",
    outline: "border border-[#23665a] text-[#23665a] bg-transparent",
  };
  return (
    <button
      className={`mt-4 w-full px-4 py-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
};

const ProductCard = ({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) => (
  <div className="border border-[#d8d1c2] bg-[#f4f1e8] p-5">
    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#b55235]">{eyebrow}</div>
    <h3 className="mt-3 text-xl font-black">{title}</h3>
    <p className="mt-3 text-sm leading-6 text-[#4d5954]">{body}</p>
  </div>
);

const ModeButton = ({
  active,
  title,
  body,
  onClick,
}: {
  active: boolean;
  title: string;
  body: string;
  onClick: () => void;
}) => (
  <button
    className={
      active
        ? "border border-[#23665a] bg-[#e5f3ed] p-4 text-left"
        : "border border-[#d8d1c2] bg-[#fffdf7] p-4 text-left"
    }
    onClick={onClick}
  >
    <div className={active ? "text-sm font-black text-[#23665a]" : "text-sm font-black text-[#4d5954]"}>{title}</div>
    <p className="mt-1 text-xs leading-5 text-[#4d5954]">{body}</p>
  </button>
);

const CloseoutStep = ({
  label,
  title,
  body,
  active,
}: {
  label: string;
  title: string;
  body: string;
  active: boolean;
}) => (
  <div className={active ? "border border-[#23665a] bg-[#edf8f1] p-4" : "border border-[#d8d1c2] bg-[#fffdf7] p-4"}>
    <div className="flex items-center gap-3">
      <span
        className={
          active
            ? "flex h-7 w-7 items-center justify-center bg-[#23665a] text-sm font-black text-white"
            : "flex h-7 w-7 items-center justify-center bg-[#ece6d8] text-sm font-black text-[#68736f]"
        }
      >
        {label}
      </span>
      <h3 className="text-base font-black">{title}</h3>
    </div>
    <p className="mt-3 min-h-12 text-sm leading-5 text-[#4d5954]">{body}</p>
  </div>
);

const StepTab = ({
  index,
  label,
  active,
  complete,
  onClick,
}: {
  index: number;
  label: string;
  active: boolean;
  complete: boolean;
  onClick: () => void;
}) => (
  <button
    className={
      active
        ? "border border-[#23665a] bg-[#0b3d35] p-4 text-left text-white"
        : complete
          ? "border border-[#23665a] bg-[#e5f3ed] p-4 text-left text-[#07110e]"
          : "border border-[#d8d1c2] bg-[#fffdf7] p-4 text-left text-[#4d5954]"
    }
    onClick={onClick}
  >
    <div className="text-xs font-black uppercase tracking-[0.18em]">{String(index).padStart(2, "0")}</div>
    <div className="mt-2 text-base font-black">{label}</div>
  </button>
);

const StatusTile = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-[#d8d1c2] bg-[#fffdf7] p-4">
    <div className="text-xs font-black uppercase tracking-[0.16em] text-[#68736f]">{label}</div>
    <div className="mt-2 break-all text-lg font-black">{value}</div>
  </div>
);

const StateLine = ({ active, label }: { active: boolean; label: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className={active ? "h-2.5 w-2.5 bg-[#1f8a5b]" : "h-2.5 w-2.5 bg-[#d8d1c2]"} />
    <span className={active ? "font-black text-[#07110e]" : "text-[#68736f]"}>{label}</span>
  </div>
);

const StepContent = ({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) => (
  <div>
    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#23665a]">{eyebrow}</p>
    <h3 className="mt-2 text-2xl font-black">{title}</h3>
    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4d5954]">{body}</p>
    <div className="mt-5">{children}</div>
  </div>
);

const DecisionBlock = ({ result, outcome, reason }: { result: string; outcome: string; reason?: string }) => (
  <div
    className={
      result === "PASS"
        ? "border border-[#1f8a5b] bg-[#dff2e7] p-5"
        : result === "FAIL"
          ? "border border-[#c44a35] bg-[#f8e5de] p-5"
          : "border border-[#d9a441] bg-[#fff4cf] p-5"
    }
  >
    <div className="text-xs font-black uppercase tracking-[0.18em] text-[#4d5954]">Verification decision</div>
    <div className="mt-2 text-5xl font-black">{result}</div>
    <div className="mt-2 text-base font-black text-[#26312e]">{outcome}</div>
    <p className="mt-2 text-sm leading-6 text-[#4d5954]">{reason || "Run verification to decide settlement."}</p>
  </div>
);
