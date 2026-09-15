"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Cabinet } from "@/components/Cabinet";
import { GAMES } from "@/game/registry";
import { makeSkin } from "@/lib/skin";

const DEMO = ["PXL", "WALL", "VROOM", "HODL"];

/** The cabinet row: the four games, each running its own demo. */
export function Roster() {
  const skins = useMemo(() => GAMES.map((g, i) => makeSkin(DEMO[i], g.accent)), []);
  return (
    <section id="games" className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">the cabinet row</p>
          <h2 className="pixel mt-3 text-[18px] leading-relaxed sm:text-[22px]">Four games. Pick one at launch.</h2>
        </div>
        <p className="max-w-md text-sm text-ink-3">Your token is the sprite: its ticker on the marquee, its logo as the thing you eat, drive, shoot with. The games run at 60 ticks a second and replay bit for bit — that is how a score gets signed.</p>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {GAMES.map((g, i) => (
          <article key={g.id} className="panel flex flex-col p-3" style={{ borderColor: g.accent }}>
            <Cabinet game={g} skin={skins[i]} mode="attract" attractSeconds={45} />
            <div className="mt-3 flex items-center justify-between">
              <h3 className="pixel text-[12px] uppercase" style={{ color: g.accent }}>
                {g.name}
              </h3>
              <span className="pixel text-[8px] uppercase text-ink-3">#{i + 1}</span>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-ink-2">{g.tagline}</p>
            <p className="mb-4 mt-2 text-[11px] leading-snug text-ink-3">{g.scoring}</p>
            <Link href={`/launch?game=${g.id}`} className="btn btn-line btn-sm mt-auto w-full">
              launch with {g.name}
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
