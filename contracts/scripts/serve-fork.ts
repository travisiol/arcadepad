import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { ethers, network } from "hardhat";

/**
 * Front-end rehearsal without a live deployment: forks Robinhood Chain
 * in-process, deploys the pad, seeds a few cabinets, warms every slot the
 * site reads, then serves the network over JSON-RPC on PORT (8697) and
 * writes ../.env.local so `next dev` points at it:
 *
 *   FORK_URL=https://rpc.mainnet.chain.robinhood.com HARDHAT_CHAIN_ID=4663 npm run serve:fork
 *   HARDHAT_CHAIN_ID=4663 npm run serve:fork        # mock Pons, no public RPC
 *
 * Start (or restart) the dev server AFTER this prints its .env.local:
 * NEXT_PUBLIC_* values are fixed at startup. Delete .env.local afterwards.
 *
 * The referee is hardhat account #1: its private key goes into .env.local
 * as REFEREE_KEY, so the site's /api/referee signs scores the seeded pad
 * accepts. The browser wallet is hardhat account #3 (alice), unlocked on
 * the fork — public/dev-wallet.js relays her transactions here.
 *
 * Why in-process rather than `hardhat node`: the public Robinhood RPC only
 * keeps recent state; a forked node that runs for more than a couple of
 * minutes starts failing remote reads. Seeding in one go and warming
 * every slot keeps everything cached — and the fork still dies after a
 * few minutes, so seed → rehearse → captures without a pause.
 */
const PONS_FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ZERO = ethers.ZeroAddress;
const PORT = Number(process.env.PORT ?? 8697);
const DAY = 24 * 3600;
const REFEREE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"; // hardhat #1
const NO_SOCIALS: [string, string, string, string, string] = ["", "", "", "", ""];

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
  "function currentSnipeTaxBps(address) view returns (uint256)",
  "function buy(uint256,uint256,address) payable returns (uint256)",
  "function sell(uint256,uint256,address) returns (uint256)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function logo() view returns (string)",
  "function description() view returns (string)",
  "function socials() view returns (string,string,string,string,string)",
  "function deployer() view returns (address)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const ESCROW_ABI = ["function balanceOf(address) view returns (uint256)"];

function serve() {
  const server = http.createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400);
        res.end("bad json");
        return;
      }
      const handle = async (call: { id?: unknown; method: string; params?: unknown[] }) => {
        if (process.env.RPC_LOG) console.log(`→ ${call.method} ${JSON.stringify(call.params ?? []).slice(0, 160)}`);
        try {
          const result = await network.provider.request({ method: call.method, params: call.params ?? [] });
          return { jsonrpc: "2.0", id: call.id ?? null, result };
        } catch (e) {
          const err = e as { code?: number; message?: string; data?: unknown };
          if (process.env.RPC_LOG) console.log(`✗ ${call.method}: ${err.message}`);
          return { jsonrpc: "2.0", id: call.id ?? null, error: { code: typeof err.code === "number" ? err.code : -32000, message: err.message ?? "error", data: err.data } };
        }
      };
      const out = Array.isArray(payload) ? await Promise.all(payload.map(handle)) : await handle(payload as { method: string });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    });
  });
  server.listen(PORT, () => console.log(`serving the fork on http://127.0.0.1:${PORT} — Ctrl+C to stop`));
}

/**
 * Without FORK_URL: the mock Pons from the unit tests on a plain hardhat
 * network, with the real Multicall3 bytecode copied in. Same seeding,
 * instant, no public RPC involved (the public RPC rate-limits forks). The
 * real factory is still what fork-check.ts proves against.
 */
async function ponsFactoryAddress(): Promise<{ factory: string; mock: boolean }> {
  if ((await ethers.provider.getCode(PONS_FACTORY)) !== "0x") return { factory: PONS_FACTORY, mock: false };
  if (process.env.FORK_URL) throw new Error("no Pons factory code at the fork target");
  const [deployer] = await ethers.getSigners();
  const mock = await (await ethers.getContractFactory("MockPonsFactory")).deploy(deployer.address);
  await mock.waitForDeployment();
  console.log(`mock pons factory ${await mock.getAddress()} (no FORK_URL: rehearsal on the mock, not the real factory)`);
  try {
    const res = await fetch("https://rpc.mainnet.chain.robinhood.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [MULTICALL3, "latest"] }) });
    const code = ((await res.json()) as { result?: string }).result;
    if (code && code !== "0x") {
      await network.provider.send("hardhat_setCode", [MULTICALL3, code]);
      console.log("multicall3 bytecode installed at the canonical address");
    }
  } catch {
    console.log("warning: could not fetch Multicall3 bytecode; batched reads will fail");
  }
  return { factory: await mock.getAddress(), mock: true };
}

async function main() {
  const [deployer, referee, treasury, alice, bob, carol, whale] = await ethers.getSigners();
  await network.provider.send("evm_mine", []);
  const { factory: factoryAddress, mock } = await ponsFactoryAddress();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (referee.address !== new ethers.Wallet(REFEREE_KEY).address) throw new Error("hardhat account #1 is not the expected referee key");

  const Pad = await ethers.getContractFactory("ArcadePad");
  const pad = await Pad.deploy(factoryAddress, referee.address, treasury.address, deployer.address, 4);
  await pad.waitForDeployment();
  const padAddr = await pad.getAddress();
  const fee: bigint = await pad.launchFee();
  const escrow = new ethers.Contract(await pad.escrow(), ESCROW_ABI, ethers.provider);
  console.log(`chainId ${chainId} block ${await ethers.provider.getBlockNumber()} pad ${padAddr} referee ${referee.address}`);

  const seeded: { symbol: string; token: string; curve: string; vault: string }[] = [];
  async function launch(who: typeof alice, symbol: string, name: string, game: number, potBps: number, roundDays: number, buyEth: string, accent: string, description: string) {
    const buy = ethers.parseEther(buyEth);
    const tx = await pad.connect(who).launch(
      { name, symbol, logo: "", description, socials: ["", "", "", "", `arcadepad:v1;accent=${accent}`], creatorTaxBps: 0, game, potBps, roundLength: roundDays * DAY, buyAmount: buy, minTokensOut: 0n },
      { value: fee + buy },
    );
    await tx.wait();
    const token = await pad.tokenAt((await pad.count()) - 1n);
    const c = await pad.cabinet(token);
    seeded.push({ symbol, token, curve: c.curve, vault: c.vault });
    console.log(`  ${symbol} (${["snake", "breakout", "racer", "invaders"][game]}) by ${who.address} — token ${token}`);
    return { token, curve: c.curve, vault: c.vault };
  }

  console.log("seeding:");
  const pxl = await launch(bob, "PXL", "Pixel Coin", 0, 5000, 7, "0.02", "green", "eat the token. the first cabinet on the pad.");
  const wall = await launch(carol, "WALL", "Sell Wall", 1, 4000, 3, "0.05", "magenta", "break the sell walls. three balls, seventy points a brick.");
  const hodl = await launch(bob, "HODL", "Paper Hands", 3, 9000, 1, "0.01", "cyan", "the paper hands are coming down. ninety percent of the fees go to the pot.");
  await launch(carol, "VROOM", "Vroom", 2, 2000, 14, "0", "yellow", "three lanes, no brakes, nobody in yet.");

  // Trades on PXL, and alice buys enough to post a score (0.01 % of supply).
  const curve = new ethers.Contract(pxl.curve, CURVE_ABI, ethers.provider);
  const token = new ethers.Contract(pxl.token, ERC20_ABI, ethers.provider);
  for (const [who, amt] of [[whale, "0.3"], [alice, "0.03"], [carol, "0.12"]] as const) {
    const v = ethers.parseEther(amt);
    await (await curve.connect(who).buy(v, 0, who.address, { value: v })).wait();
  }
  const whaleBal: bigint = await token.balanceOf(whale.address);
  await (await token.connect(whale).approve(pxl.curve, whaleBal / 3n)).wait();
  await (await curve.connect(whale).sell(whaleBal / 3n, 0, whale.address)).wait();
  console.log(`  PXL: 3 buys + 1 sell; alice holds ${ethers.formatEther(await token.balanceOf(alice.address))} PXL`);

  // HODL's pot: on a real fork the curve graduates and Pons sweeps real
  // creator fees to the escrow; on the mock the escrow is credited by hand.
  await network.provider.send("hardhat_setBalance", [whale.address, "0x" + ethers.parseEther("50").toString(16)]);
  const hCurve = new ethers.Contract(hodl.curve, CURVE_ABI, ethers.provider);
  if (mock) {
    const mockEscrow = new ethers.Contract(await pad.escrow(), ["function credit(address) payable"], whale);
    await (await mockEscrow.credit(hodl.vault, { value: ethers.parseEther("0.042") })).wait();
    const v = ethers.parseEther("0.5");
    await (await hCurve.connect(whale).buy(v, 0, whale.address, { value: v })).wait();
  } else {
    const threshold: bigint = await hCurve.graduationThreshold();
    for (let i = 0; i < 6 && !(await hCurve.graduated()); i++) {
      const real: bigint = await hCurve.realQuoteReserve();
      const need = threshold - real + ethers.parseEther("0.2");
      const chunk = need > ethers.parseEther("1.5") ? ethers.parseEther("1.5") : need;
      await (await hCurve.connect(whale).buy(chunk, 0, whale.address, { value: chunk })).wait();
    }
  }
  const swept: bigint = await escrow.balanceOf(hodl.vault);
  if (swept > 0n) {
    await (await pad.connect(carol).collect(hodl.token)).wait();
    console.log(`  HODL: ${ethers.formatEther(swept)} ETH swept and collected — pot ${ethers.formatEther((await pad.cabinet(hodl.token)).pot)} ETH`);
  } else {
    console.log("  HODL: nothing swept yet");
  }
  // Alice holds HODL too, so she can post there as well.
  const hToken = new ethers.Contract(hodl.token, ERC20_ABI, ethers.provider);
  await (await hToken.connect(whale).transfer(alice.address, ethers.parseEther("500000"))).wait();

  // Warm every slot the site reads, so nothing touches the remote RPC later.
  const accounts = [alice.address, ZERO, deployer.address, bob.address, carol.address];
  for (const s of seeded) {
    const c = new ethers.Contract(s.curve, CURVE_ABI, ethers.provider);
    const t = new ethers.Contract(s.token, ERC20_ABI, ethers.provider);
    await Promise.allSettled([
      c.getReserves(), c.realQuoteReserve(), c.graduationThreshold(), c.graduated(), c.launchSupply(), c.feeBps(), c.creatorTaxBps(),
      c.quoteFeeBalance(), c.protocolFeeShareBps(), c.deployer(), c.token(), c.pairToken(),
      t.name(), t.symbol(), t.decimals(), t.totalSupply(), t.logo(), t.description(), t.socials(), t.deployer(), t.balanceOf(s.curve),
      escrow.balanceOf(s.vault), pad.cabinet(s.token), pad.collectable(s.token), pad.roundEnd(s.token), pad.dueForSettlement(s.token),
      ...accounts.flatMap((a) => [c.currentSnipeTaxBps(a), t.balanceOf(a), t.allowance(a, s.curve), pad.claimable(a)]),
    ]);
  }
  await Promise.all([pad.count(), pad.page(0, 60), pad.page(0, 120), pad.page(0, 6), pad.referee(), pad.treasury(), pad.owner()]);
  for (const a of accounts) await ethers.provider.getBalance(a);
  if ((await ethers.provider.getCode(MULTICALL3)) === "0x") console.log("warning: no Multicall3 on this fork");

  const env = [
    `# written by contracts/scripts/serve-fork.ts — rehearsal only, delete afterwards`,
    `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:${PORT}`,
    `NEXT_PUBLIC_CHAIN_ID=${chainId}`,
    `NEXT_PUBLIC_PAD=${padAddr}`,
    `NEXT_PUBLIC_DEV_WALLET=1`,
    `REFEREE_KEY=${REFEREE_KEY}`,
    "",
  ].join("\n");
  const envFile = path.resolve(__dirname, "../../.env.local");
  fs.writeFileSync(envFile, env);
  console.log(`\nwrote ${envFile}:\n${env}`);
  console.log(`browser wallet (unlocked on the fork): ${alice.address}`);
  console.log(`  localStorage.setItem("arcadepad:dev-wallet", JSON.stringify({ rpc: "http://127.0.0.1:${PORT}", address: "${alice.address}" }))`);
  console.log(`seeded: ${JSON.stringify(seeded)}`);
  serve();
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
