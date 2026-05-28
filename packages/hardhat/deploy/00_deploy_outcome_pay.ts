import { deployScript } from "../rocketh/deploy.js";
import * as artifacts from "../generated/artifacts/index.js";

const MOCK_USDC_SUPPLY = 1_000_000n * 1_000_000n;
const DEMO_PLAN_PRICE = 10n * 1_000_000n;

export default deployScript(
  async env => {
    const { deployer } = env.namedAccounts;

    const mockUSDC = await env.deploy("MockUSDC", {
      account: deployer,
      artifact: artifacts.MockUSDC,
      args: [deployer],
    });

    const outcomePayEscrow = await env.deploy("OutcomePayEscrow", {
      account: deployer,
      artifact: artifacts.OutcomePayEscrow,
      args: [deployer, deployer],
    });

    const demoSubscription = await env.deploy("DemoSubscription", {
      account: deployer,
      artifact: artifacts.DemoSubscription,
      args: [deployer, DEMO_PLAN_PRICE, "OutcomePay Demo Subscription"],
    });

    const deployerBalance = await env.read(mockUSDC, { functionName: "balanceOf", args: [deployer] });
    if (deployerBalance === 0n) {
      await env.execute(mockUSDC, { account: deployer, functionName: "mint", args: [deployer, MOCK_USDC_SUPPLY] });
    }

    console.log("OutcomePay AI contracts deployed:");
    console.log("MockUSDC:", mockUSDC.address);
    console.log("OutcomePayEscrow:", outcomePayEscrow.address);
    console.log("DemoSubscription:", demoSubscription.address);
  },
  {
    tags: ["OutcomePay"],
  },
);
