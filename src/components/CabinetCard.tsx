"use client";

import Link from "next/link";
import { GAMES } from "@/game/registry";
import { formatUnitsTrim } from "@/lib/curvemath";
import { shortAddress, usd } from "@/lib/format";
import type { CabinetView } from "@/lib/market";
import { countdown, useNow } from "@/lib/useNow";
import { TokenLogo } from "./TokenLogo";

const ZERO = "0x0000000000000000000000000000000000000000";

export function CabinetCard({ c, ethUsd }: { c: CabinetView; ethUsd: number | null }) {
  const now = useNow();
  const game = GAMES[c.game] ?? GAMES[0];
  const accent = c.accent;
  const end = c.roundStart + c.roundLength;
  const potEth = Number(formatUnitsTrim(c.pot, 18, 6));
  const due = now > 0 && now >= end;
  return (
    <Link href={`/play/${c.token}`} className="panel block p-4 transition-transform hover:-translate-y-[2px]" style={{ borderColor: accent }}>
      <div className="flex items-center gap-3">
        <TokenLogo logo={c.logo} symbol={c.symbol} accent={accent} size={48} />
        <div className="min-w-0 flex-1">
          <div className="pixel truncate text-[12px] uppercase" style={{ color: accent }}>
            ${c.symbol}
          </div>
          <div className="truncate text-sm text-ink-2">{c.name}</div>
        </div>
        <span className="pixel border-[3px] border-black bg-black px-2 py-1 text-[8px] uppercase" style={{ color: game.accent }}>
          {game.name}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <dt className="label">pot</dt>
          <dd className="led mt-1 text-[12px]">{formatUnitsTrim(c.pot, 18, 4)} Ξ</dd>
          <dd className="text-[11px] text-ink-3">{ethUsd ? usd(potEth * ethUsd) : "—"}</dd>
        </div>
        <div>
          <dt className="label">high score</dt>
          <dd className="led mt-1 text-[12px]">{c.bestScore.toString()}</dd>
          <dd className="mono text-[11px] text-ink-3">{c.bestPlayer !== ZERO ? shortAddress(c.bestPlayer) : "no score yet"}</dd>
        </div>
        <div>
          <dt className="label">round {c.round}</dt>
          <dd className="led mt-1 text-[12px]">{now === 0 ? "—" : due ? "bell" : countdown(end - now)}</dd>
          <dd className="text-[11px] text-ink-3">{due ? "settles on next play" : "until the bell"}</dd>
        </div>
      </dl>
    </Link>
  );
}
