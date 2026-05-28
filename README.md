# OutcomePay AI

**AI agents should not pay for promises. They should pay for verified onchain outcomes.**

OutcomePay AI is a verified settlement layer for AI agents buying onchain work on Arbitrum. A Buyer Agent escrows funds, a Provider Agent submits machine-checkable proof, OutcomePay verifies onchain state, then the settlement releases, refunds, or disputes and creates an Outcome Receipt.

OutcomePay is not a task marketplace and not a payment rail. It starts after agents already agreed on work. Its job is to answer one question:

> Did the provider deliver the agreed onchain outcome, and should money move?

## Judge Fast Path

Use this path first. It does not require a wallet, test ETH, or test tokens.

1. Open the demo app.
2. Click `Start guided demo`.
3. Confirm each step: Create -> Fund -> Proof -> Verify -> Settle.
4. Review the `PASS` decision and `Outcome Receipt #001`.
5. Optional: switch to `Live Wallet Flow` to inspect the contract-backed path.

The default Product Demo Mode is intentional: judges can understand the product story without getting blocked by wallet setup.

## Live Wallet Flow

Use this path when you want to verify the contract-backed workflow.

1. Switch to `Live Wallet Flow`.
2. Click `Connect Wallet` for a real wallet.
3. For local Hardhat testing, use the smaller `Demo Wallet` shortcut.
4. Mint demo mUSDC.
5. Create a settlement.
6. Approve and fund escrow.
7. Submit the prefilled contract address and deployment transaction hash.
8. Run verification.
9. Settle and review the Outcome Receipt.

Live flow proves the same settlement story is backed by smart contracts. Product Demo Mode is the safer public judging path; Live Wallet Flow is the technical proof path.

## What It Verifies

OutcomePay does not trust screenshots, chat messages, or provider claims. For the demo outcome, it checks:

- contract bytecode exists
- deployment transaction succeeded
- owner matches the expected Buyer Agent
- plan price matches the escrow amount

The verifier returns one of three decisions:

- `PASS`: release payment to the Provider Agent
- `FAIL`: refund the Buyer Agent
- `DISPUTE`: freeze the settlement for manual review

## Outcome Receipt

Every completed settlement creates an Outcome Receipt that records:

- what was requested
- what proof was submitted
- what was verified
- whether funds were released, refunded, or disputed
- the hashes and contract references behind the decision

This receipt is the core product object. It is the audit trail that lets agents, marketplaces, and protocols understand why money moved.

## Arbitrum Sepolia Contracts

Network: **Arbitrum Sepolia**  
Chain ID: `421614`

| Contract | Address |
| --- | --- |
| `OutcomePayEscrow` | `0x137e1fce49dd1d7e7d46a62b2ab6000bf660b21a` |
| `MockUSDC` | `0x6a16548a10ca98e44b1761790bb5b3583dd53e37` |
| `DemoSubscription` | `0x86089f6fac227ed6eba0e71097ae6bf3d49fb11f` |

Deployment transactions:

| Contract | Tx hash |
| --- | --- |
| `OutcomePayEscrow` | `0x22c7aa9d7e354c13f82f627b53617a86ffbbed06504087366f44404fba1a5b1d` |
| `MockUSDC` | `0xd02ee282d9ab8bd8d8c997b72d4e316326d8954b3e54fe25816a2a53416bb84f` |
| `DemoSubscription` | `0x10bba49a6cb99fa6eb4af975a540f2762d71ac921a9ec92f8651c6d70dba8b44` |

## System Components

### Smart contracts

- `OutcomePayEscrow`: creates settlements, holds escrow, records verification, releases, refunds, disputes, and emits receipt events.
- `MockUSDC`: demo ERC-20 token used as the settlement currency.
- `DemoSubscription`: sample provider output used for proof verification.

### Frontend

- Product Demo Mode for no-wallet judging.
- Live Wallet Flow for real contract interaction.
- Outcome Receipt UI for the final settlement proof.
- Contract/debug page for judges who want to inspect deployed contracts.

### Verifier

The demo verifier checks the submitted contract address and deployment transaction hash against onchain data, then returns a `PASS`, `FAIL`, or `DISPUTE` decision with a verification hash.

## Local Development

Requirements:

- Node `>= 22.10.0`
- Corepack / Yarn

Install dependencies:

```bash
corepack enable
corepack yarn install
```

Start a local Hardhat chain:

```bash
corepack yarn chain
```

Deploy local contracts:

```bash
corepack yarn deploy
```

Start the frontend:

```bash
corepack yarn workspace @se-2/nextjs dev --port 3003
```

Open:

```text
http://127.0.0.1:3003
```

## Public Deployment Env

For an Arbitrum Sepolia judging deployment:

```bash
NEXT_PUBLIC_TARGET_NETWORK=arbitrumSepolia
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_key
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
```

Local development defaults to Hardhat when `NEXT_PUBLIC_TARGET_NETWORK` is not set.

## Hardhat Deployment Env

Create `packages/hardhat/.env`:

```bash
ALCHEMY_API_KEY=your_alchemy_key
__RUNTIME_DEPLOYER_PRIVATE_KEY=0x_your_test_wallet_private_key
ETHERSCAN_API_KEY=your_arbiscan_or_etherscan_key_optional
```

Deploy to Arbitrum Sepolia:

```bash
corepack yarn workspace @se-2/hardhat hardhat deploy --network arbitrumSepolia --skip-prompts
```

## Verification Commands

Commands used during development:

```bash
corepack yarn next:check-types
corepack yarn test
corepack yarn next:build
```

Current contract tests cover:

- create and fund settlement
- release payment after `PASS`
- refund buyer after `FAIL`
- block non-provider proof submission

## Demo Script

AI agents should not pay for promises. They should pay for verified onchain outcomes.

In this demo, the Buyer Agent escrows 10 mUSDC for a subscription contract deployment. The Provider Agent submits a contract address and deployment transaction hash. OutcomePay checks bytecode, transaction success, ownership, and price. If verification passes, payment is released and an Outcome Receipt is created. If proof fails, the buyer is refunded or the settlement can be disputed.

OutcomePay is the settlement layer after agents agree on work: verify proof, move money, and create the receipt.
