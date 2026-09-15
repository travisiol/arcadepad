/**
 * Screenshots of the running site with headless Chrome, driven over the
 * DevTools protocol (Node's built-in WebSocket, no dependency):
 *
 *   node scripts/capture.mjs [base=http://localhost:3880] [outDir=docs/captures]
 *   ONLY=hero,explorer node scripts/capture.mjs      # a subset
 *
 * The cabinets run on 2D canvas; SwiftShader is kept so nothing GPU-bound
 * ever blocks a capture. Device metrics are emulated per shot
 * (Chrome refuses windows narrower than ~500 px, so phone widths need the
 * emulation), and each shot waits a real few seconds for chain reads.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const base = process.argv[2] ?? "http://localhost:3880";
const out = resolve(process.argv[3] ?? "docs/captures");
mkdirSync(out, { recursive: true });
const only = process.env.ONLY?.split(",");

const CANDIDATES = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("no Chrome found");

const shots = [
  { name: "hero", path: "/", w: 1440, h: 900 },
  { name: "landing-full", path: "/", w: 1440, h: 900, full: true },
  { name: "launch", path: "/launch", w: 1440, h: 1400 },
  { name: "arcade", path: "/arcade", w: 1440, h: 900 },
  { name: "play", path: "/play/" + (process.env.TOKEN ?? "0x0000000000000000000000000000000000000000"), w: 1440, h: 1500 },
  { name: "mobile-hero", path: "/", w: 400, h: 860, mobile: true },
  { name: "mobile-landing-full", path: "/", w: 400, h: 860, mobile: true, full: true },
  { name: "mobile-play", path: "/play/" + (process.env.TOKEN ?? "0x0000000000000000000000000000000000000000"), w: 400, h: 1400, mobile: true },
].filter((s) => !only || only.includes(s.name));

const PORT = 9338;
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${resolve(tmpdir(), "arcadepad-capture")}`,
    `--remote-debugging-port=${PORT}`,
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--hide-scrollbars",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChrome() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("chrome did not start");
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function connect() {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  return { cdp: new Cdp(ws), ws, targetId: target.id };
}

try {
  await waitForChrome();
  for (const s of shots) {
    const { cdp, ws, targetId } = await connect();
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height: s.h, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
    await cdp.send("Page.navigate", { url: base + s.path });
    // Real time: fonts, the WebGL scenes and the chain reads.
    await sleep(7000);
    let clip;
    if (s.full) {
      const { contentSize } = await cdp.send("Page.getLayoutMetrics");
      const height = Math.min(Math.ceil(contentSize.height), 6000);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.w, height, deviceScaleFactor: 1, mobile: Boolean(s.mobile) });
      await sleep(1500);
      clip = { x: 0, y: 0, width: s.w, height, scale: 1 };
    }
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: Boolean(s.full), ...(clip ? { clip } : {}) });
    writeFileSync(resolve(out, `${s.name}.png`), Buffer.from(data, "base64"));
    console.log(`${s.name}.png`);
    ws.close();
    await fetch(`http://127.0.0.1:${PORT}/json/close/${targetId}`).catch(() => {});
  }
} finally {
  proc.kill();
}
