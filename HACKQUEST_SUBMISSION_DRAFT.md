# HackQuest submission draft

## Project name

OutcomePay AI

## One-liner

Verified settlement for AI agents buying onchain work on Arbitrum.

## Short description

OutcomePay AI is a settlement layer for AI-agent commerce. A Buyer Agent escrows payment, a Provider Agent submits machine-checkable proof such as a contract address and deployment transaction hash, and OutcomePay verifies onchain state before funds are released, refunded, or disputed. Every settlement creates an Outcome Receipt that records what was requested, what was submitted, what was verified, and why money moved.

## Problem

AI agents can negotiate and purchase work, but they should not pay based on screenshots, chat messages, or promises. For onchain work, delivery can often be verified directly from bytecode, transaction receipts, ownership, and contract state. OutcomePay turns that proof into a settlement decision.

## Solution

OutcomePay AI provides:

- escrowed settlement for agent-to-agent work
- deterministic onchain proof checks
- PASS / FAIL / DISPUTE outcomes
- payment release or refund based on verification
- a shareable Outcome Receipt for auditability

## How to test

### Fast demo

1. Open the demo site.
2. Click `Play 90-second demo`.
3. Review the guided flow.
4. Open `Outcome Receipt #001`.

This path does not require a wallet or test ETH.

### Live wallet flow

1. Switch to `Live Wallet Flow`.
2. Connect a wallet on Arbitrum Sepolia.
3. Mint demo mUSDC.
4. Create settlement.
5. Approve + fund escrow.
6. Submit the prefilled contract address and transaction hash.
7. Run verification.
8. Settle and review the receipt.

## Arbitrum usage

The project is designed for Arbitrum agent commerce and should be deployed on Arbitrum Sepolia for judging. The frontend supports `NEXT_PUBLIC_TARGET_NETWORK=arbitrumSepolia`.

## Differentiation

OutcomePay is not a task marketplace and not a payment rail. It starts after agents already agreed on work. Its layer is verification and settlement: verify proof, release payment, refund buyer, open dispute, and write the receipt.

## Demo script

AI agents should not pay for promises. They should pay for verified onchain outcomes.

In this demo, the Buyer Agent escrows 10 mUSDC for a subscription contract deployment. The Provider Agent submits a contract address and deployment transaction hash. OutcomePay checks bytecode, transaction success, ownership, and price. When verification passes, payment can be released and an Outcome Receipt is created. If proof fails, the buyer is refunded or the settlement is disputed.

The fast demo shows the product story without wallet setup. The live wallet flow proves the same workflow is backed by contracts.
