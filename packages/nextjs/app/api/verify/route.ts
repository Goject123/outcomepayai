import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, isHash, keccak256, parseAbi, stringToHex } from "viem";
import { hardhat } from "viem/chains";

const deliverableAbi = parseAbi([
  "function owner() view returns (address)",
  "function planPrice() view returns (uint256)",
]);

type VerifyBody = {
  contractAddress?: string;
  txHash?: string;
  buyer?: string;
  expectedOwner?: string;
  expectedPrice?: string;
};

const client = createPublicClient({
  chain: hardhat,
  transport: http(process.env.NEXT_PUBLIC_HARDHAT_RPC_URL || "http://127.0.0.1:8545"),
});

export async function POST(request: Request) {
  const body = (await request.json()) as VerifyBody;
  const contractAddress = body.contractAddress;
  const txHash = body.txHash;
  const buyer = body.buyer;
  const expectedOwner = body.expectedOwner || body.buyer;
  const expectedPrice = BigInt(body.expectedPrice || "0");

  if (!contractAddress || !isAddress(contractAddress)) {
    return NextResponse.json({ reason: "Invalid submitted contract address" }, { status: 400 });
  }
  if (!txHash || !isHash(txHash)) {
    return NextResponse.json({ reason: "Invalid deployment tx hash" }, { status: 400 });
  }
  if (!buyer || !isAddress(buyer) || !expectedOwner || !isAddress(expectedOwner)) {
    return NextResponse.json({ reason: "Invalid buyer address" }, { status: 400 });
  }

  const [code, receiptResult, ownerResult, planPriceResult] = await Promise.allSettled([
    client.getCode({ address: contractAddress }),
    client.getTransactionReceipt({ hash: txHash }),
    client.readContract({
      address: contractAddress,
      abi: deliverableAbi,
      functionName: "owner",
    }),
    client.readContract({
      address: contractAddress,
      abi: deliverableAbi,
      functionName: "planPrice",
    }),
  ]);

  const receipt = receiptResult.status === "fulfilled" ? receiptResult.value : undefined;
  const owner = ownerResult.status === "fulfilled" ? ownerResult.value : undefined;
  const planPrice = planPriceResult.status === "fulfilled" ? planPriceResult.value : undefined;

  const checks = {
    contractExists: code.status === "fulfilled" && Boolean(code.value && code.value !== "0x"),
    txValid: receipt?.status === "success" && receipt.contractAddress?.toLowerCase() === contractAddress.toLowerCase(),
    ownerMatches: owner?.toLowerCase() === expectedOwner.toLowerCase(),
    priceMatches: planPrice === expectedPrice,
  };
  const result = Object.values(checks).every(Boolean) ? "PASS" : "FAIL";
  const reason =
    result === "PASS"
      ? "All onchain checks passed."
      : "One or more onchain checks failed. Payment should not be released.";
  const verificationHash = keccak256(
    stringToHex(JSON.stringify({ checks, result, txHash, contractAddress, buyer, expectedOwner })),
  );

  return NextResponse.json({
    result,
    checks,
    reason,
    verificationHash,
  });
}
