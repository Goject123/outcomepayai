# OutcomePay AI deployment checklist

## Demo strategy

Use Product Demo Mode as the default judging path. It does not require a wallet and shows the full story:

Create settlement -> Fund escrow -> Submit proof -> PASS -> Outcome Receipt

Use Live Wallet Flow as the technical proof path. It requires wallet confirmations and is best for live walkthroughs or judges who want to inspect the contracts.

## Arbitrum Sepolia deployment

The hardhat config already includes `arbitrumSepolia`.

Required environment variables in `packages/hardhat/.env`:

```bash
ALCHEMY_API_KEY=your_alchemy_key
__RUNTIME_DEPLOYER_PRIVATE_KEY=0x_your_test_wallet_private_key
ETHERSCAN_API_KEY=your_arbiscan_or_etherscan_key_optional
```

Deploy:

```bash
corepack yarn deploy --network arbitrumSepolia
```

After deployment, confirm `packages/nextjs/contracts/deployedContracts.ts` contains chain id `421614`.

## Frontend network switch

For local development, `packages/nextjs/scaffold.config.ts` can stay on `chains.hardhat`.

For public judging deployment, switch:

```bash
NEXT_PUBLIC_TARGET_NETWORK=arbitrumSepolia
```

The app defaults to `hardhat` when this variable is not set.

Recommended Vercel environment variables:

```bash
NEXT_PUBLIC_ALCHEMY_API_KEY=your_alchemy_key
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=your_walletconnect_project_id
```

## Submission proof

Before submitting:

1. Open the deployed Vercel URL.
2. Click `Play 90-second demo`.
3. Confirm the page reaches `Outcome Receipt #001`.
4. Click `Contracts` and verify deployed addresses are visible.
5. Open Arbitrum Sepolia explorer links for the deployed contracts.
6. Record a short video using Product Demo Mode first, then show Live Wallet Flow / contracts.
