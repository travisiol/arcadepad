"use client";

import Link from "next/link";
import { CabinetCard } from "@/components/CabinetCard";
import { useCabinets, useEthUsd } from "@/lib/market";

export function Latest() {
  const { configured, cabinets, isLoading } = useCabinets(6);
  const ethUsd = useEthUsd();
  return (
    <section className="py-12 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">latest cabinets</p>
          <h2 className="pixel mt-3 text-[18px] leading-relaxed sm:text-[22px]">Now playing</h2>
        </div>
        <Link href="/arcade" className="btn btn-line btn-sm">
          the whole arcade
        </Link>
      </div>
      {!configured ? (
        <p className="panel-inset mt-8 p-6 text-sm text-ink-3">The pad is not on chain yet. Once it is deployed, every cabinet launched shows up here, live.</p>
      ) : cabinets.length === 0 ? (
        <p className="panel-inset mt-8 p-6 text-sm text-ink-3">{isLoading ? "reading the chain…" : "Nothing launched yet. Yours could be first."}</p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cabinets.map((c) => (
            <CabinetCard key={c.token} c={c} ethUsd={ethUsd} />
          ))}
        </div>
      )}
    </section>
  );
}
