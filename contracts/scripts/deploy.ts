import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { deploymentsDir, type DeploymentRecord } from "./lib/exportAbi";

/**
 * Deploys ArcadePad and writes contracts/deployments/<network>.json, which
 * next.config.ts reads to point the site at the pad — nothing to paste.
 *
 *   npm run deploy:robinhood
 *
 * contracts/.env:
 *   DEPLOYER_PRIVATE_KEY   pays the gas, becomes the pad's owner
 *   REFEREE                address of the key the site's referee signs with (REFEREE_KEY on the host)
 *   TREASURY               receives the pad's 10 % (defaults to the deployer)
 *   GAME_COUNT             4 — the length of the site's cabinet row (src/game/registry.ts)
 */
const PONS_FACTORY = process.env.PONS_FACTORY ?? "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No signer: set DEPLOYER_PRIVATE_KEY in contracts/.env");
  if (network.name === "hardhat") await network.provider.send("evm_mine", []);
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const referee = process.env.REFEREE?.trim();
  const treasury = process.env.TREASURY?.trim() || deployer.address;
  const gameCount = Number(process.env.GAME_COUNT ?? 4);
  if (!referee || !ethers.isAddress(referee)) throw new Error("REFEREE must be the referee key's address");
  if (!ethers.isAddress(treasury)) throw new Error("TREASURY must be an address");
  if ((await ethers.provider.getCode(PONS_FACTORY)) === "0x") throw new Error(`no code at the Pons factory ${PONS_FACTORY} on chain ${chainId}`);

  console.log(`network ${network.name} chainId ${chainId} deployer ${deployer.address}`);
  console.log(`factory ${PONS_FACTORY} referee ${referee} treasury ${treasury} games ${gameCount}`);
  const Pad = await ethers.getContractFactory("ArcadePad");
  const pad = await Pad.deploy(PONS_FACTORY, referee, treasury, deployer.address, gameCount);
  const tx = pad.deploymentTransaction();
  console.log(`sent ${tx?.hash}, waiting…`);
  await pad.waitForDeployment();
  const receipt = tx ? await tx.wait() : null;
  const address = await pad.getAddress();
  console.log(`ArcadePad at ${address} (block ${receipt?.blockNumber}, gas ${receipt?.gasUsed})`);

  const record: DeploymentRecord = {
    network: network.name,
    chainId,
    deployer: deployer.address,
    ponsFactory: PONS_FACTORY,
    forwarder: await pad.forwarder(),
    escrow: await pad.escrow(),
    pad: address,
    referee,
    treasury,
    owner: deployer.address,
    gameCount,
    block: receipt?.blockNumber ?? 0,
    deployedAt: new Date().toISOString(),
    txHash: tx?.hash ?? null,
  };
  fs.mkdirSync(deploymentsDir, { recursive: true });
  const file = path.join(deploymentsDir, `${network.name === "hardhat" ? "local" : network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log(`wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
