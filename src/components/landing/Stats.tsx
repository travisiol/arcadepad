"use client";

import { formatUnitsTrim } from "@/lib/curvemath";
import { usd } from "@/lib/format";
import { totals, useCabinets, useEthUsd } from "@/lib/market";

/** Pad-wide numbers, straight from the chain. Dashes until the pad is deployed. */
export function Stats() {
  const { configured, count, cabinets } = useCabinets(60);
  const ethUsd = useEthUsd();
  const t = totals(cabinets);
  const item = (label: string, value: string, sub?: string) => (
    <div className="panel-inset p-4">
      <div className="label">{label}</div>
      <div className="led mt-2 text-[16px] sm:text-[18px]">{value}</div>
      <div className="mt-1 text-[11px] text-ink-3">{sub ?? "\u00a0"}</div>
    </div>
  );
  const eth = (v: bigint) => `${formatUnitsTrim(v, 18, 4)} Ξ`;
  const inUsd = (v: bigint) => (ethUsd ? usd(Number(formatUnitsTrim(v, 18, 6)) * ethUsd) : undefined);
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {item("cabinets", configured ? String(count) : "—", configured ? "launched on the pad" : "pad awaiting deployment")}
      {item("pots open", configured ? eth(t.pot) : "—", configured ? inUsd(t.pot) ?? "in the cabinets now" : undefined)}
      {item("paid to players", configured ? eth(t.paidOut) : "—", configured ? inUsd(t.paidOut) ?? "since launch" : undefined)}
      {item("fees collected", configured ? eth(t.collected) : "—", configured ? inUsd(t.collected) ?? "through the vaults" : undefined)}
    </section>
  );
}
