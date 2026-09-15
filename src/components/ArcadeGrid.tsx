"use client";

import Link from "next/link";
import { useState } from "react";
import { GAMES } from "@/game/registry";
import { useCabinets, useEthUsd } from "@/lib/market";
import { CabinetCard } from "./CabinetCard";

export function ArcadeGrid() {
  const { configured, cabinets, isLoading, error } = useCabinets(120);
  const ethUsd = useEthUsd();
  const [filter, setFilter] = useState<number>(-1);
  const shown = filter < 0 ? cabinets : cabinets.filter((c) => c.game === filter);
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by game">
        <button type="button" role="tab" aria-selected={filter < 0} className="btn btn-line btn-sm" style={filter < 0 ? { background: "#ffe600", color: "#000" } : undefined} onClick={() => setFilter(-1)}>
          all
        </button>
        {GAMES.map((g, i) => (
          <button key={g.id} type="button" role="tab" aria-selected={filter === i} className="btn btn-line btn-sm" style={filter === i ? { background: g.accent, color: "#000" } : undefined} onClick={() => setFilter(i)}>
            {g.name}
          </button>
        ))}
      </div>
      {!configured ? (
        <div className="panel-inset mt-8 p-6">
          <p className="text-sm text-ink-2">The pad is not on chain yet.</p>
          <p className="mt-2 text-sm text-ink-3">The four games already run — try them on the home page. Cabinets appear here the moment the pad is deployed and the first token launches.</p>
        </div>
      ) : error ? (
        <p className="panel-inset mt-8 p-6 text-sm text-red">could not read the chain: {error.message.split("\n")[0].toLowerCase()}</p>
      ) : shown.length === 0 ? (
        <div className="panel-inset mt-8 p-6">
          <p className="text-sm text-ink-2">{isLoading ? "reading the chain…" : filter < 0 ? "Nothing launched yet. Yours could be first." : `No ${GAMES[filter].name} cabinet yet.`}</p>
          {!isLoading ? (
            <Link href={filter < 0 ? "/launch" : `/launch?game=${GAMES[filter].id}`} className="btn btn-magenta btn-sm mt-4">
              insert coin
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <CabinetCard key={c.token} c={c} ethUsd={ethUsd} />
          ))}
        </div>
      )}
    </div>
  );
}
