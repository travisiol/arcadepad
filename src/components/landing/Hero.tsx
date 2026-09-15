"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Cabinet } from "@/components/Cabinet";
import { GAMES } from "@/game/registry";
import { localSeed, type FinishedRun } from "@/game/runner";
import { makeSkin } from "@/lib/skin";
import { site } from "@/lib/site";

const DEMO_SKINS = [
  { symbol: "PXL", accent: "#39ff14" },
  { symbol: "WALL", accent: "#ff2bd6" },
  { symbol: "VROOM", accent: "#ffe600" },
  { symbol: "HODL", accent: "#19f0ff" },
];

/**
 * The hero cabinet: attract mode cycles the four games with demo tokens;
 * "press start" hands you the controls for a free run — no wallet, no
 * referee, just the game. The pitch sits next to it.
 */
export function Hero() {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState<"attract" | "play">("attract");
  const [seed, setSeed] = useState(() => 1);
  const [last, setLast] = useState<FinishedRun | null>(null);
  const game = GAMES[idx];
  const skin = useMemo(() => makeSkin(DEMO_SKINS[idx].symbol, DEMO_SKINS[idx].accent), [idx]);

  const onOver = useCallback(
    (run: FinishedRun) => {
      if (mode === "attract") {
        // Next cabinet in the row after the demo.
        setTimeout(() => setIdx((i) => (i + 1) % GAMES.length), 2200);
      } else {
        setLast(run);
        setTimeout(() => setMode("attract"), 6000);
      }
    },
    [mode],
  );

  const start = () => {
    setLast(null);
    setSeed(localSeed());
    setMode("play");
  };

  return (
    <section className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
      <div className="rise">
        <p className="label">a launchpad on robinhood chain · pons v2</p>
        <h1 className="pixel mt-5 text-[22px] leading-[1.4] sm:text-[30px] lg:text-[34px] xl:text-[36px]">
          <span className="text-yellow sm:whitespace-nowrap">LAUNCH A TOKEN.</span>
          <br />
          <span className="text-magenta sm:whitespace-nowrap">LAUNCH A GAME.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
          Every token launched here comes with its own arcade cabinet — Snake, Breakout, Racer or Invaders, skinned with your coin. Every trade pays fees. The fees fill the cabinet&apos;s prize pot. The high score takes the pot.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link href="/launch" className="btn btn-magenta">
            insert coin · launch
          </Link>
          <Link href="/arcade" className="btn btn-line">
            browse the arcade
          </Link>
        </div>
        <ul className="mt-8 grid max-w-xl grid-cols-3 gap-3">
          {[
            ["free to play", "no coin needed to play. hold 0.01% of the supply to post a score."],
            ["pot = fees", "10–90% of the token's creator fees, chosen at launch, go to the pot."],
            ["one winner", "each round's high score takes the whole pot. rounds are 1–30 days."],
          ].map(([k, v]) => (
            <li key={k} className="panel-inset p-3">
              <div className="pixel text-[9px] uppercase text-cyan">{k}</div>
              <div className="mt-2 text-[12px] leading-snug text-ink-3">{v}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rise mx-auto w-full max-w-[584px]">
        <Cabinet
          game={game}
          skin={skin}
          mode={mode}
          seed={seed}
          runKey={`${idx}:${mode}`}
          variant="cabinet"
          attractSeconds={40}
          onStart={start}
          onOver={onOver}
          marquee={mode === "play" ? `${skin.symbol} · ${game.name} · you` : undefined}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex gap-2" role="tablist" aria-label="Demo game">
            {GAMES.map((g, i) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={i === idx}
                onClick={() => {
                  setIdx(i);
                  setMode("attract");
                  setLast(null);
                }}
                className="pixel border-[3px] border-black px-2 py-1 text-[8px] uppercase"
                style={{ background: i === idx ? g.accent : "#120c24", color: i === idx ? "#000" : "#8a86a8", boxShadow: "2px 2px 0 #000" }}
              >
                {g.name}
              </button>
            ))}
          </div>
          <span className="pixel text-[9px] uppercase text-ink-3">
            {last ? `you scored ${last.score} · ${site.shortName} demo` : mode === "play" ? "your run · arrows + space" : "demo · press start to play"}
          </span>
        </div>
      </div>
    </section>
  );
}
