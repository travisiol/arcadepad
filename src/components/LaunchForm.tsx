"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { decodeEventLog, parseEther, type Address, type Hex } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Cabinet } from "@/components/Cabinet";
import { ConnectButton, useMounted } from "@/components/ConnectButton";
import { GAMES } from "@/game/registry";
import type { Skin } from "@/game/types";
import { padAbi } from "@/lib/abi/generated";
import { explorer, robinhoodChain } from "@/lib/chain";
import { DEFAULT_POT_BPS, DEFAULT_ROUND_DAYS, LAUNCH_FEE_ETH_DISPLAY, MAX_POT_BPS, MIN_POT_BPS, PAD, PAD_BPS } from "@/lib/contracts";
import { ETH_PHANTOM_QUOTE, formatUnitsTrim, LAUNCH_SUPPLY, parseDecimal, quoteBuy, withSlippage } from "@/lib/curvemath";
import { explainError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { ACCENTS, extraFor, loadLogoSprite, logoUrl, makeSkin, type AccentId } from "@/lib/skin";

const ROUND_OPTIONS = [1, 3, 7, 14, 30] as const;

interface Draft {
  game: number;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  accent: AccentId;
  buy: string;
  potBps: number;
  roundDays: number;
  creatorTaxBps: number;
  x: string;
  telegram: string;
  website: string;
  discord: string;
}

const EMPTY: Draft = {
  game: 0,
  name: "",
  symbol: "",
  logo: "",
  description: "",
  accent: "green",
  buy: "0.01",
  potBps: DEFAULT_POT_BPS,
  roundDays: DEFAULT_ROUND_DAYS,
  creatorTaxBps: 0,
  x: "",
  telegram: "",
  website: "",
  discord: "",
};

const DRAFT_KEY = "arcadepad:draft";

/** The saved draft, with ?game= from the URL on top. Client-only (this form is not server-rendered). */
function readDraft(): Draft {
  let draft = EMPTY;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) draft = { ...EMPTY, ...(JSON.parse(raw) as Partial<Draft>) };
  } catch {
    /* fresh */
  }
  const q = new URLSearchParams(window.location.search).get("game");
  const gi = GAMES.findIndex((g) => g.id === q);
  return gi >= 0 ? { ...draft, game: gi } : draft;
}

/**
 * The launch console. One transaction: token + curve + cabinet. The
 * preview on the right is the real cabinet running the real game with the
 * skin you are typing. Rendered on the client only (next/dynamic) so the
 * draft can come straight from localStorage.
 */
export function LaunchForm() {
  const mounted = useMounted();
  const [d, setD] = useState<Draft>(readDraft);
  const [advanced, setAdvanced] = useState(false);
  const [logoSprite, setLogoSprite] = useState<HTMLCanvasElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Hex | undefined>();
  const [launched, setLaunched] = useState<{ token: Address; curve: Address } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch {
      /* private mode */
    }
  }, [d]);

  useEffect(() => {
    let alive = true;
    loadLogoSprite(logoUrl(d.logo)).then((c) => alive && setLogoSprite(c));
    return () => {
      alive = false;
    };
  }, [d.logo]);

  const accentHex = ACCENTS.find((a) => a.id === d.accent)?.hex ?? ACCENTS[0].hex;
  const skin: Skin = useMemo(() => makeSkin(d.symbol || "TOKEN", accentHex, logoSprite), [d.symbol, accentHex, logoSprite]);
  const game = GAMES[d.game] ?? GAMES[0];

  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === robinhoodChain.id;
  const { data: eth } = useBalance({ address, chainId: robinhoodChain.id, query: { enabled: Boolean(address) } });
  const { data: fee } = useReadContract({ address: PAD, abi: padAbi, functionName: "launchFee", chainId: robinhoodChain.id, query: { enabled: Boolean(PAD) } });
  const launchFee = fee ?? parseEther(LAUNCH_FEE_ETH_DISPLAY);

  const buyWei = useMemo(() => parseDecimal(d.buy) ?? null, [d.buy]);
  const estimate = useMemo(() => (buyWei && buyWei > 0n ? quoteBuy(ETH_PHANTOM_QUOTE, LAUNCH_SUPPLY, buyWei, 100n, BigInt(d.creatorTaxBps)) : 0n), [buyWei, d.creatorTaxBps]);
  const total = launchFee + (buyWei ?? 0n);

  const symbolOk = /^[A-Za-z0-9]{1,11}$/.test(d.symbol);
  const nameOk = d.name.trim().length >= 1 && d.name.trim().length <= 34;
  const logoOk = d.logo === "" || /^(https:\/\/|ipfs:\/\/)/.test(d.logo.trim());
  const buyOk = buyWei !== null && buyWei >= 0n;
  const insufficient = Boolean(eth && eth.value < total + parseEther("0.0005"));
  const problems: string[] = [];
  if (!nameOk) problems.push("a name, 1–34 characters");
  if (!symbolOk) problems.push("a ticker, 1–11 letters or digits");
  if (!logoOk) problems.push("a logo as an https or ipfs url");
  if (!buyOk) problems.push("a first buy in eth (0 is fine)");

  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: robinhoodChain.id });

  const canLaunch = mounted && Boolean(PAD) && onChain && problems.length === 0 && !insufficient && !isPending && !pending;

  async function submit() {
    if (!PAD || !address || buyWei === null || !client) return;
    setNote(null);
    try {
      const socials = [d.x.trim(), d.telegram.trim(), d.website.trim(), d.discord.trim(), extraFor(d.accent)] as const;
      const hash = await writeContractAsync({
        address: PAD,
        abi: padAbi,
        functionName: "launch",
        args: [
          {
            name: d.name.trim(),
            symbol: d.symbol.trim().toUpperCase(),
            logo: d.logo.trim(),
            description: d.description.trim(),
            socials: [...socials] as [string, string, string, string, string],
            creatorTaxBps: d.creatorTaxBps,
            game: d.game,
            potBps: d.potBps,
            roundLength: d.roundDays * 86400,
            buyAmount: buyWei,
            minTokensOut: buyWei > 0n ? withSlippage(estimate, 300n) : 0n,
          },
        ],
        value: total,
        chainId: robinhoodChain.id,
      });
      setPending(hash);
      setNote({ kind: "info", text: `launch sent · ${shortAddress(hash, 8)} — waiting for the block…` });
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("the launch transaction reverted.");
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== PAD.toLowerCase()) continue;
        try {
          const ev = decodeEventLog({ abi: padAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "CabinetLaunched") {
            const args = ev.args as unknown as { token: Address; curve: Address };
            try {
              localStorage.removeItem(DRAFT_KEY);
            } catch {
              /* ignore */
            }
            setLaunched({ token: args.token, curve: args.curve });
            return;
          }
        } catch {
          /* not ours */
        }
      }
      throw new Error("mined, but no CabinetLaunched event found — check the explorer.");
    } catch (e) {
      setNote({ kind: "error", text: e instanceof Error && !("walk" in e) ? e.message : explainError(e) });
    } finally {
      setPending(undefined);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setNote(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await fetch("/api/logo", { method: "POST", body });
      const json = (await res.json()) as { uri?: string; error?: string };
      if (!res.ok || !json.uri) throw new Error(json.error ?? "upload failed");
      setD((x) => ({ ...x, logo: json.uri! }));
    } catch (e) {
      setNote({ kind: "error", text: (e as Error).message });
    } finally {
      setUploading(false);
    }
  }

  if (launched) {
    return (
      <div className="panel rise mx-auto max-w-2xl p-6 sm:p-8" style={{ borderColor: accentHex }}>
        <p className="label">cabinet launched</p>
        <h2 className="pixel mt-3 text-[18px] leading-relaxed" style={{ color: accentHex }}>
          ${d.symbol.toUpperCase()} is live on {game.name}.
        </h2>
        <p className="mt-4 text-sm text-ink-2">Token, curve and cabinet exist on Robinhood Chain. Share the cabinet — every trade on the curve now feeds its pot.</p>
        <dl className="mono mt-5 space-y-2 text-[12px]">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-ink-3">token (CA)</dt><dd><a href={explorer.address(launched.token)} target="_blank" rel="noreferrer" className="hover:text-yellow">{launched.token}</a></dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-ink-3">curve</dt><dd><a href={explorer.address(launched.curve)} target="_blank" rel="noreferrer" className="hover:text-yellow">{launched.curve}</a></dd></div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/play/${launched.token}`} className="btn btn-magenta">
            open the cabinet
          </Link>
          <button type="button" className="btn btn-line" onClick={() => { setLaunched(null); setPending(undefined); setD(EMPTY); }}>
            launch another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_440px] lg:gap-10">
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (canLaunch) submit();
        }}
      >
        {/* 1. the game */}
        <fieldset>
          <legend className="pixel text-[12px] uppercase text-yellow">1 · pick the game</legend>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GAMES.map((g, i) => (
              <button
                key={g.id}
                type="button"
                aria-pressed={d.game === i}
                onClick={() => setD({ ...d, game: i })}
                className="panel-inset p-3 text-left transition-transform hover:-translate-y-[2px]"
                style={{ borderColor: d.game === i ? g.accent : undefined, boxShadow: d.game === i ? `4px 4px 0 ${g.accent}` : undefined }}
              >
                <div className="pixel text-[11px] uppercase" style={{ color: g.accent }}>
                  {g.name}
                </div>
                <div className="mt-2 text-[11px] leading-snug text-ink-3">{g.tagline}</div>
              </button>
            ))}
          </div>
        </fieldset>

        {/* 2. the token */}
        <fieldset className="space-y-4">
          <legend className="pixel text-[12px] uppercase text-yellow">2 · the token</legend>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <label className="block">
              <span className="label">name</span>
              <input className="field mt-2" value={d.name} maxLength={34} placeholder="Pixel Coin" onChange={(e) => setD({ ...d, name: e.target.value })} aria-invalid={d.name !== "" && !nameOk} />
            </label>
            <label className="block">
              <span className="label">ticker</span>
              <input className="field mt-2 uppercase" value={d.symbol} maxLength={11} placeholder="PXL" onChange={(e) => setD({ ...d, symbol: e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase() })} aria-invalid={d.symbol !== "" && !symbolOk} />
            </label>
          </div>
          <label className="block">
            <span className="label">logo · https or ipfs url</span>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="field min-w-0 flex-1" value={d.logo} placeholder="https://… or ipfs://…" onChange={(e) => setD({ ...d, logo: e.target.value })} aria-invalid={!logoOk} />
              <label className={`btn btn-line btn-sm cursor-pointer ${uploading ? "opacity-60" : ""}`}>
                {uploading ? "pinning…" : "upload"}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} disabled={uploading} />
              </label>
            </div>
            <span className="mt-1 block text-[11px] text-ink-3">the logo becomes a 16×16 sprite in the game: the thing you eat, the car you drive, the ship you fly.</span>
          </label>
          <label className="block">
            <span className="label">description</span>
            <textarea className="field mt-2 min-h-[84px]" value={d.description} maxLength={400} placeholder="what is this coin, in a sentence or two" onChange={(e) => setD({ ...d, description: e.target.value })} />
          </label>
          <div>
            <span className="label">cabinet colour</span>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Cabinet colour">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={d.accent === a.id} title={a.name} onClick={() => setD({ ...d, accent: a.id })} className="h-9 w-9 border-[3px] border-black" style={{ background: a.hex, boxShadow: d.accent === a.id ? "0 0 0 3px #fff" : "3px 3px 0 #000" }} />
              ))}
            </div>
          </div>
        </fieldset>

        {/* 3. the money */}
        <fieldset className="space-y-4">
          <legend className="pixel text-[12px] uppercase text-yellow">3 · the money</legend>
          <label className="block">
            <span className="label">your first buy · eth</span>
            <input className="field mt-2 mono" inputMode="decimal" value={d.buy} onChange={(e) => setD({ ...d, buy: e.target.value })} aria-invalid={!buyOk} />
            <span className="mt-1 block text-[11px] text-ink-3">
              {buyWei && buyWei > 0n ? `≈ ${formatUnitsTrim(estimate, 18, 0)} ${d.symbol || "tokens"} at the opening price, bought before anyone else (you are exempt from the snipe tax).` : "0 is allowed: the token opens with nobody in."}
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">pot share · {d.potBps / 100}% of your creator fees</span>
              <input type="range" min={MIN_POT_BPS} max={MAX_POT_BPS} step={500} value={d.potBps} onChange={(e) => setD({ ...d, potBps: Number(e.target.value) })} className="mt-3 w-full accent-[#ff2bd6]" />
              <span className="mt-1 block text-[11px] text-ink-3">pad 10% · pot {d.potBps / 100}% · you {(10000 - PAD_BPS - d.potBps) / 100}%. frozen at launch.</span>
            </label>
            <label className="block">
              <span className="label">round length</span>
              <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Round length">
                {ROUND_OPTIONS.map((days) => (
                  <button key={days} type="button" role="radio" aria-checked={d.roundDays === days} onClick={() => setD({ ...d, roundDays: days })} className="btn btn-line btn-sm" style={d.roundDays === days ? { background: "#ffe600", color: "#000" } : undefined}>
                    {days}d
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-[11px] text-ink-3">the high score takes the pot at every bell.</span>
            </label>
          </div>
          <button type="button" className="pixel text-[9px] uppercase text-ink-3 hover:text-yellow" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "− fewer options" : "+ socials & creator tax"}
          </button>
          {advanced ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(["x", "telegram", "website", "discord"] as const).map((k) => (
                <label key={k} className="block">
                  <span className="label">{k}</span>
                  <input className="field mt-2" value={d[k]} placeholder="https://…" onChange={(e) => setD({ ...d, [k]: e.target.value })} />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="label">creator tax · {d.creatorTaxBps / 100}% on every trade (pons caps it at 10%)</span>
                <input type="range" min={0} max={1000} step={25} value={d.creatorTaxBps} onChange={(e) => setD({ ...d, creatorTaxBps: Number(e.target.value) })} className="mt-3 w-full accent-[#19f0ff]" />
                <span className="mt-1 block text-[11px] text-ink-3">an extra fee on top of pons&apos; 1%, paid to the same vault — so it feeds the pot at the same split. 0 is the honest default.</span>
              </label>
            </div>
          ) : null}
        </fieldset>

        {/* 4. go */}
        <div className="panel p-5">
          <dl className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
            <div><dt className="label">pons fee</dt><dd className="mono mt-1">{formatUnitsTrim(launchFee, 18, 4)} Ξ</dd></div>
            <div><dt className="label">first buy</dt><dd className="mono mt-1">{buyWei !== null ? formatUnitsTrim(buyWei, 18, 4) : "—"} Ξ</dd></div>
            <div><dt className="label">total</dt><dd className="mono mt-1 text-yellow">{formatUnitsTrim(total, 18, 4)} Ξ</dd></div>
            <div><dt className="label">pad fee</dt><dd className="mono mt-1">0 Ξ · 10% of fees later</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {!mounted ? null : !PAD ? (
              <span className="text-sm text-ink-3">The pad is not on chain yet — launching opens the moment it is deployed.</span>
            ) : !isConnected ? (
              <ConnectButton size="md" />
            ) : !onChain ? (
              <ConnectButton size="md" />
            ) : (
              <button type="submit" className="btn btn-magenta" disabled={!canLaunch}>
                {isPending ? "confirm in wallet…" : pending ? "launching…" : "launch token + game"}
              </button>
            )}
            {problems.length ? <span className="text-[12px] text-ink-3">needs {problems.join(", ")}.</span> : insufficient ? <span className="text-[12px] text-red">not enough eth for the total plus gas.</span> : null}
          </div>
          {note ? <p className={`mt-4 text-[13px] ${note.kind === "error" ? "text-red" : "text-cyan"}`}>{note.text}</p> : null}
        </div>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="label mb-3">your cabinet · live preview</p>
        <Cabinet game={game} skin={skin} mode="attract" attractSeconds={40} variant="cabinet" runKey={d.game} />
        <p className="mt-3 text-[11px] leading-snug text-ink-3">This is the real game with your skin, played by the demo bot. Players get this cabinet at /play/&lt;your token&gt;.</p>
      </aside>
    </div>
  );
}
