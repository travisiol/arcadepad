import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Proves the pad against the REAL Pons V2 on a fork of Robinhood Chain:
 *
 *   FORK_URL=https://rpc.mainnet.chain.robinhood.com npm run fork:check
 *
 * In-process fork on purpose (the public RPC only keeps recent state; a
 * long-lived forked node dies after a couple of minutes). What it checks:
 *
 *   1. launch with a first buy through Pons' forwarder → the curve's fee
 *      recipient (deployer) is the cabinet's FeeVault, the creator got the
 *      tokens the local constant-product quote predicts, to the wei;
 *   2. launch without a first buy through the factory;
 *   3. a real graduation (4.2 ETH bought on the curve) makes Pons sweep
 *      creator fees into its escrow for the vault → collect() splits them
 *      into pot / creator / pad through the real escrow;
 *   4. a referee-signed score from a holder is accepted, a non-holder's is
 *      not; the round settles at the bell and the winner withdraws the pot.
 */
const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const NO_SOCIALS: [string, string, string, string, string] = ["", "", "", "", ""];
const DAY = 24 * 3600;
const BPS = 10_000n;
const PHANTOM = ethers.parseEther("1.68");

const CURVE_ABI = [
  "function getReserves() view returns (uint256,uint256)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function graduated() view returns (bool)",
  "function launchSupply() view returns (uint256)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function quoteFeeBalance() view returns (uint256)",
  "function protocolFeeShareBps() view returns (uint256)",
  "function deployer() view returns (address)",
  "function token() view returns (address)",
  "function pairToken() view returns (address)",
  "function buy(uint256,uint256,address) payable returns (uint256)",
  "function sell(uint256,uint256,address) returns (uint256)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function approve(address,uint256) returns (bool)",
];
const ESCROW_ABI = ["function balanceOf(address) view returns (uint256)"];

let checks = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failed++;
}

function quoteBuy(quote: bigint, tokens: bigint, amountIn: bigint, feeBps: bigint): bigint {
  const net = amountIn - (amountIn * feeBps) / BPS;
  return (tokens * net) / (quote + net);
}

async function main() {
  const [deployer, referee, treasury, creator, alice, whale, stranger] = await ethers.getSigners();
  await network.provider.send("evm_mine", []);
  if ((await ethers.provider.getCode(PONS_FACTORY)) === "0x") {
    throw new Error("Not a Robinhood Chain fork: set FORK_URL=https://rpc.mainnet.chain.robinhood.com");
  }
  const block = await ethers.provider.getBlockNumber();
  console.log(`fork of Robinhood Chain at block ${block}, chainId ${(await ethers.provider.getNetwork()).chainId}`);

  const Pad = await ethers.getContractFactory("ArcadePad");
  const pad = await Pad.deploy(PONS_FACTORY, referee.address, treasury.address, deployer.address, 4);
  await pad.waitForDeployment();
  const padAddr = await pad.getAddress();
  const fee: bigint = await pad.launchFee();
  const escrow = new ethers.Contract(await pad.escrow(), ESCROW_ABI, ethers.provider);
  console.log(`pad ${padAddr}, forwarder ${await pad.forwarder()}, escrow ${await escrow.getAddress()}, launch fee ${ethers.formatEther(fee)} ETH`);

  // 1. Launch with a first buy.
  console.log("\n1. launch with a first buy (0.01 ETH, Snake, pot 40 %, 7-day rounds)");
  const buy = ethers.parseEther("0.01");
  const input = {
    name: "Pixel Coin",
    symbol: "PXL",
    logo: "",
    description: "the arcade pad rehearsal token",
    socials: NO_SOCIALS,
    creatorTaxBps: 0,
    game: 0,
    potBps: 4000,
    roundLength: 7 * DAY,
    buyAmount: buy,
    minTokensOut: 0n,
  };
  const tx = await pad.connect(creator).launch(input, { value: fee + buy });
  const receipt = await tx.wait();
  const token = await pad.tokenAt(0);
  const cab = await pad.cabinet(token);
  const curve = new ethers.Contract(cab.curve, CURVE_ABI, ethers.provider);
  const erc20 = new ethers.Contract(token, ERC20_ABI, ethers.provider);
  console.log(`  token ${token} curve ${cab.curve} vault ${cab.vault} gas ${receipt!.gasUsed}`);
  ok(await curve.deployer() === cab.vault, "the curve's fee recipient is the cabinet's vault");
  ok(await curve.token() === token, "curve.token() is the launched token");
  ok(await curve.pairToken() === ethers.ZeroAddress, "ETH-paired curve");
  const supply: bigint = await curve.launchSupply();
  const feeBps: bigint = await curve.feeBps();
  const expected = quoteBuy(PHANTOM, supply, buy, feeBps);
  const got: bigint = await erc20.balanceOf(creator.address);
  ok(got === expected, `creator received exactly the local quote: ${ethers.formatEther(got)} PXL (fee ${feeBps} bps)`);
  ok(cab.minHold === supply / BPS, `minHold is 0.01 % of the supply: ${ethers.formatEther(cab.minHold)} PXL`);
  ok(await erc20.symbol() === "PXL" && await erc20.description() === input.description, "token metadata is on chain");

  // 2. Launch without a first buy.
  console.log("\n2. launch without a first buy (Invaders)");
  const tx2 = await pad.connect(creator).launch({ ...input, symbol: "INV", name: "Invader Coin", game: 3, buyAmount: 0n }, { value: fee });
  await tx2.wait();
  const token2 = await pad.tokenAt(1);
  const cab2 = await pad.cabinet(token2);
  const curve2 = new ethers.Contract(cab2.curve, CURVE_ABI, ethers.provider);
  ok(await curve2.deployer() === cab2.vault, "second cabinet: fee recipient is its own vault");
  ok((await pad.count()) === 2n, "two cabinets");
  const page = await pad.page(0, 10);
  ok(page[0].token === token2 && page[1].token === token, "page() is newest first");

  // 3. Fees through the real escrow: buy up to graduation so Pons sweeps.
  console.log("\n3. graduate PXL so Pons sweeps creator fees to the escrow");
  await network.provider.send("hardhat_setBalance", [whale.address, "0x" + ethers.parseEther("50").toString(16)]);
  const aliceBuy = ethers.parseEther("0.02");
  await (await curve.connect(alice).buy(aliceBuy, 0, alice.address, { value: aliceBuy })).wait();
  const aliceBal: bigint = await erc20.balanceOf(alice.address);
  ok(aliceBal >= cab.minHold, `alice holds ${ethers.formatEther(aliceBal)} PXL ≥ minHold`);
  const threshold: bigint = await curve.graduationThreshold();
  let bought = 0n;
  for (let i = 0; i < 6 && !(await curve.graduated()); i++) {
    const real: bigint = await curve.realQuoteReserve();
    const chunk = threshold - real + ethers.parseEther("0.2") > ethers.parseEther("1.5") ? ethers.parseEther("1.5") : threshold - real + ethers.parseEther("0.2");
    await (await curve.connect(whale).buy(chunk, 0, whale.address, { value: chunk })).wait();
    bought += chunk;
  }
  ok(await curve.graduated(), `curve graduated after ${ethers.formatEther(bought)} ETH bought (threshold ${ethers.formatEther(threshold)})`);
  const swept: bigint = await escrow.balanceOf(cab.vault);
  ok(swept > 0n, `escrow credits the vault: ${ethers.formatEther(swept)} ETH`);
  const collectable: bigint = await pad.collectable(token);
  ok(collectable === swept, "collectable() reads the escrow credit");
  await (await pad.connect(stranger).collect(token)).wait();
  const after = await pad.cabinet(token);
  ok(after.pot === (swept * 4000n) / BPS, `pot = 40 %: ${ethers.formatEther(after.pot)} ETH`);
  ok((await pad.claimable(creator.address)) === swept - (swept * 4000n) / BPS - (swept * 1000n) / BPS, "creator gets the rest");
  ok((await pad.claimable(treasury.address)) === (swept * 1000n) / BPS, "pad gets 10 %");
  ok((await escrow.balanceOf(cab.vault)) === 0n, "escrow credit drained");

  // 4. Scores and the round.
  console.log("\n4. scores");
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = { name: "ArcadePad", version: "1", chainId, verifyingContract: padAddr };
  const types = {
    Score: [
      { name: "cabinet", type: "address" },
      { name: "player", type: "address" },
      { name: "round", type: "uint256" },
      { name: "score", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const deadline = (await time.latest()) + 600;
  const sig = await referee.signTypedData(domain, types, { cabinet: token, player: alice.address, round: 1, score: 1337, deadline });
  await (await pad.connect(alice).postScore(token, alice.address, 1337, deadline, sig)).wait();
  ok((await pad.cabinet(token)).bestPlayer === alice.address, "alice's referee-signed 1337 is the round's best");
  const sigS = await referee.signTypedData(domain, types, { cabinet: token, player: stranger.address, round: 1, score: 9999, deadline });
  let refused = false;
  try {
    await pad.connect(stranger).postScore(token, stranger.address, 9999, deadline, sigS);
  } catch (e) {
    refused = String((e as Error).message).includes("NotAHolder");
  }
  ok(refused, "a non-holder's signed score is refused (NotAHolder)");
  await time.increase(7 * DAY);
  await (await pad.settle(token)).wait();
  const settled = await pad.cabinet(token);
  ok(settled.round === 2n && settled.pot === 0n, "round 2 opened, pot paid out");
  ok((await pad.claimable(alice.address)) === after.pot, `alice can withdraw the pot: ${ethers.formatEther(after.pot)} ETH`);
  const before = await ethers.provider.getBalance(alice.address);
  const w = await (await pad.connect(alice).withdraw()).wait();
  const gasCost = w!.gasUsed * w!.gasPrice;
  ok((await ethers.provider.getBalance(alice.address)) === before + after.pot - gasCost, "withdraw() paid the pot");

  console.log(`\n${checks - failed}/${checks} checks passed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
