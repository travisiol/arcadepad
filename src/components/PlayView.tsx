"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { Cabinet } from "@/components/Cabinet";
import { ConnectButton, useMounted } from "@/components/ConnectButton";
import { RoundPanel } from "@/components/RoundPanel";
import { TokenLogo } from "@/components/TokenLogo";
import { TradePanel } from "@/components/TradePanel";
import { GAMES } from "@/game/registry";
import { toSeed } from "@/game/rng";
import { localSeed, type FinishedRun } from "@/game/runner";
import { padAbi } from "@/lib/abi/generated";
import { explorer, robinhoodChain } from "@/lib/chain";
import { PAD } from "@/lib/contracts";
import { formatUnitsTrim } from "@/lib/curvemath";
import { explainError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { useCabinet, useEthUsd } from "@/lib/market";
import { erc20Abi } from "@/lib/ponsAbi";
import { refereeStatus, RefereeError, startRun, verifyRun, type RefereeStatus, type SignedScore, type StartedRun } from "@/lib/referee";
import { site } from "@/lib/site";
import { loadLogoSprite, logoUrl, makeSkin } from "@/lib/skin";
import { useNow } from "@/lib/useNow";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

type Phase = "idle" | "playing" | "verifying" | "signed" | "unsigned" | "posting" | "posted";

/**
 * A cabinet's page: the machine, the pot, the curve. The run itself is
 * the same code the referee replays; a run started with a referee seed can
 * be signed and posted, a run started without one is just for fun.
 */
export function PlayView({ token }: { token: Address }) {
  const mounted = useMounted();
  const { configured, cabinet, isLoading, notFound, error, refetch } = useCabinet(token);
  const ethUsd = useEthUsd();
  const { address, isConnected } = useAccount();
  const now = useNow();

  const [referee, setReferee] = useState<RefereeStatus | null>(null);
  useEffect(() => {
    refereeStatus().then(setReferee);
  }, []);

  const [logoSprite, setLogoSprite] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let alive = true;
    loadLogoSprite(logoUrl(cabinet?.logo ?? "")).then((c) => alive && setLogoSprite(c));
    return () => {
      alive = false;
    };
  }, [cabinet?.logo]);

  const game = cabinet ? GAMES[cabinet.game] ?? GAMES[0] : GAMES[0];
  const skin = useMemo(() => makeSkin(cabinet?.symbol ?? "TOKEN", cabinet?.accent ?? game.accent, logoSprite), [cabinet?.symbol, cabinet?.accent, game.accent, logoSprite]);

  // The run.
  const [mode, setMode] = useState<"attract" | "play">("attract");
  const [seed, setSeed] = useState(1);
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [ticket, setTicket] = useState<StartedRun | null>(null);
  const [last, setLast] = useState<FinishedRun | null>(null);
  const [signed, setSigned] = useState<SignedScore | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sessionBest, setSessionBest] = useState(0);
  const ticketRef = useRef<StartedRun | null>(null);

  const { data: balance } = useReadContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address ?? ZERO], chainId: robinhoodChain.id, query: { enabled: Boolean(address), refetchInterval: 8_000 } });
  const holds = cabinet !== null && balance !== undefined && balance >= cabinet.minHold;

  const start = useCallback(async () => {
    setNote(null);
    setSigned(null);
    setLast(null);
    let t: StartedRun | null = null;
    if (address && referee?.online && configured) {
      try {
        t = await startRun(token, address);
      } catch (e) {
        setNote(`referee: ${(e as Error).message} — playing unsigned.`);
      }
    }
    ticketRef.current = t;
    setTicket(t);
    setSeed(t ? toSeed(t.seed) : localSeed());
    setRunId((n) => n + 1);
    setMode("play");
    setPhase("playing");
  }, [address, referee, configured, token]);

  const onOver = useCallback(
    async (run: FinishedRun) => {
      setLast(run);
      setSessionBest((b) => Math.max(b, run.score));
      const t = ticketRef.current;
      if (!t || !address) {
        setPhase("unsigned");
        return;
      }
      if (run.score === 0) {
        setPhase("unsigned");
        setNote("a zero is not worth signing. again?");
        return;
      }
      setPhase("verifying");
      try {
        const s = await verifyRun({ token, player: address, seed: t.seed, issuedAt: t.issuedAt, ticket: t.ticket, inputs: run.inputs });
        setSigned(s);
        setPhase("signed");
      } catch (e) {
        setPhase("unsigned");
        setNote(e instanceof RefereeError ? `referee: ${e.message}` : `referee unreachable: ${(e as Error).message}`);
      }
    },
    [address, token],
  );

  // Posting: send, then wait for the block right here.
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: robinhoodChain.id });

  async function post() {
    if (!PAD || !address || !signed || !client) return;
    setNote(null);
    setPhase("posting");
    try {
      const hash: Hex = await writeContractAsync({
        address: PAD,
        abi: padAbi,
        functionName: "postScore",
        args: [token, address, BigInt(signed.score), BigInt(signed.deadline), signed.signature],
        chainId: robinhoodChain.id,
      });
      setNote(`posting · ${shortAddress(hash, 8)}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        setPhase("posted");
        setNote(`high score on chain · ${shortAddress(receipt.transactionHash, 8)}`);
      } else {
        setPhase("signed");
        setNote("the transaction reverted — someone may have beaten it first.");
      }
      refetch();
    } catch (e) {
      setPhase("signed");
      setNote(explainError(e));
    }
  }

  const beats = signed !== null && cabinet !== null && (BigInt(signed.score) > cabinet.bestScore || now >= cabinet.roundStart + cabinet.roundLength);
  const expired = signed !== null && now > 0 && now > signed.deadline;

  if (!mounted) return <div className="py-16 text-center text-ink-3">loading…</div>;
  if (!configured) {
    return (
      <div className="panel mx-auto max-w-xl p-6">
        <p className="pixel text-[12px] uppercase text-yellow">no pad on chain yet</p>
        <p className="mt-3 text-sm text-ink-2">Cabinets exist once the pad is deployed. The games themselves already run on the home page.</p>
        <Link href="/" className="btn btn-line btn-sm mt-4">home</Link>
      </div>
    );
  }
  if (isLoading && !cabinet) return <div className="py-16 text-center text-ink-3">reading the cabinet…</div>;
  if (notFound || (!cabinet && !isLoading)) {
    return (
      <div className="panel mx-auto max-w-xl p-6">
        <p className="pixel text-[12px] uppercase text-red">no cabinet at this address</p>
        <p className="mono mt-3 break-all text-sm text-ink-3">{token}</p>
        {error ? <p className="mt-2 text-sm text-ink-3">{error.message.split("\n")[0].toLowerCase()}</p> : null}
        <Link href="/arcade" className="btn btn-line btn-sm mt-4">the arcade</Link>
      </div>
    );
  }
  const c = cabinet!;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-10">
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <TokenLogo logo={c.logo} symbol={c.symbol} accent={c.accent} size={56} />
          <div className="min-w-0">
            <h1 className="pixel text-[16px] uppercase leading-relaxed sm:text-[20px]" style={{ color: c.accent }}>
              ${c.symbol} <span className="text-ink-3">·</span> {game.name}
            </h1>
            <p className="text-sm text-ink-2">{c.name}</p>
          </div>
        </div>
        {c.description ? <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-3">{c.description}</p> : null}

        <div className="mt-6">
          <Cabinet
            game={game}
            skin={skin}
            mode={mode}
            seed={seed}
            runKey={runId}
            variant="cabinet"
            attractSeconds={45}
            onStart={start}
            onOver={onOver}
            marquee={mode === "play" ? `${c.symbol} · ${game.name} · ${ticket ? "refereed run" : "free run"}` : undefined}
          />
        </div>

        {/* The run's status line. */}
        <div className="panel mt-6 p-4" style={{ borderColor: c.accent }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[13px] text-ink-2">
              {phase === "idle" && (
                <>
                  <span className="pixel text-[10px] uppercase text-ink">press start</span>
                  <span className="text-ink-3"> · {game.controls}. </span>
                  {!isConnected ? <span className="text-ink-3">connect a wallet to get your score signed.</span> : !referee?.online ? <span className="text-orange">referee offline — runs are unsigned for now.</span> : <span className="text-green">referee online — your run will be signed.</span>}
                </>
              )}
              {phase === "playing" && <span className="text-cyan">{ticket ? "refereed run in progress…" : "free run in progress…"}</span>}
              {phase === "verifying" && <span className="text-cyan">run over — the referee is replaying it…</span>}
              {phase === "unsigned" && last && <span>run over · {last.score} points{ticket ? "" : " · unsigned (free run)"}. </span>}
              {phase === "signed" && signed && (
                <span>
                  <span className="text-green">signed</span> · {signed.score} points · round {signed.round} ·{" "}
                  {expired ? <span className="text-orange">signature expired, play again.</span> : !beats ? <span className="text-ink-3">not above the round&apos;s {c.bestScore.toString()}.</span> : !holds ? <span className="text-orange">hold {formatUnitsTrim(c.minHold, 18, 0)} ${c.symbol} to post it.</span> : <span className="text-green">beats the high score — post it!</span>}
                </span>
              )}
              {phase === "posting" && <span className="text-cyan">posting on chain…</span>}
              {phase === "posted" && <span className="text-green">your score is the high score of round {signed?.round}.</span>}
              {note ? <div className="mt-1 text-[12px] text-ink-3">{note}</div> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {phase === "signed" && beats && holds && !expired ? (
                <button type="button" className="btn btn-green btn-sm" onClick={post} disabled={isPending}>
                  {isPending ? "confirm…" : "post score"}
                </button>
              ) : null}
              {phase === "signed" && !isConnected ? <ConnectButton /> : null}
              {phase !== "idle" && phase !== "playing" && phase !== "verifying" && phase !== "posting" ? (
                <button type="button" className="btn btn-line btn-sm" onClick={start}>
                  play again
                </button>
              ) : null}
            </div>
          </div>
          {sessionBest > 0 ? <div className="label mt-3">your best this session · {sessionBest}</div> : null}
        </div>

        {/* On chain */}
        <div className="panel mt-6 p-5">
          <h2 className="pixel text-[12px] uppercase text-ink">on chain</h2>
          <dl className="mono mt-3 space-y-2 text-[12px]">
            {[
              ["token (CA)", c.token],
              ["curve", c.curve],
              ["fee vault", c.vault],
              ["creator", c.creator],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                <dt className="text-ink-3">{k}</dt>
                <dd className="flex items-center gap-2">
                  <a href={explorer.address(v)} target="_blank" rel="noreferrer" className="hover:text-yellow">{shortAddress(v, 6)}</a>
                  <CopyButton text={v} />
                </dd>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="text-ink-3">launched</dt>
              <dd>{new Date(c.launchedAt * 1000).toISOString().slice(0, 10)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`${site.ponsUrl}/token/${c.token}`} target="_blank" rel="noreferrer" className="btn btn-line btn-sm">pons ↗</a>
            {c.socials.slice(0, 4).map((s, i) => (s ? <a key={i} href={s} target="_blank" rel="noreferrer" className="btn btn-line btn-sm">{["x", "telegram", "website", "discord"][i]} ↗</a> : null))}
            <ShareButton symbol={c.symbol} game={game.name} token={c.token} />
          </div>
        </div>
      </div>

      <aside className="space-y-6">
        <RoundPanel c={c} ethUsd={ethUsd} onChanged={refetch} />
        <TradePanel token={c.token} curve={c.curve} symbol={c.symbol} graduated={c.graduated} accent={c.accent} onTraded={refetch} />
        <div className="panel-inset p-4 text-[12px] leading-relaxed text-ink-3">
          {game.scoring} Runs last at most 15 minutes. The referee replays every run tick for tick and signs only what it reproduced; bots can play, and the pot goes to the best run, whoever made it.
        </div>
      </aside>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pixel border-[2px] border-line-2 px-1.5 py-0.5 text-[8px] uppercase text-ink-3 hover:text-yellow"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "copied" : "copy"}
    </button>
  );
}

function ShareButton({ symbol, game, token }: { symbol: string; game: string; token: string }) {
  const text = `$${symbol} has an arcade cabinet. ${game}, high score takes the pot. ${site.url}/play/${token}`;
  return (
    <a href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn btn-line btn-sm">
      share on x ↗
    </a>
  );
}
