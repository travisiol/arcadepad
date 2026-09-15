"use client";

import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { padAbi } from "./abi/generated";
import { robinhoodChain } from "./chain";
import { PAD } from "./contracts";
import { curveAbi } from "./ponsAbi";
import { accentFor, accentFromExtra } from "./skin";

/**
 * What the site knows about a cabinet: the pad's record plus the token's
 * own metadata (Pons tokens keep name / symbol / logo on chain) and the
 * curve's reserves. Read straight from the chain through multicall — no
 * indexer, no API.
 */
export interface CabinetView {
  token: Address;
  curve: Address;
  vault: Address;
  creator: Address;
  game: number;
  potBps: number;
  roundLength: number;
  launchedAt: number;
  roundStart: number;
  round: number;
  pot: bigint;
  bestScore: bigint;
  bestPlayer: Address;
  collected: bigint;
  paidOut: bigint;
  minHold: bigint;
  name: string;
  symbol: string;
  logo: string;
  description: string;
  /** x, telegram, website, discord, extra — as stored on the token. */
  socials: string[];
  /** The cabinet colour: chosen at launch (kept in socials.extra), else drawn from the address. */
  accent: string;
  reserves: readonly [bigint, bigint] | null;
  graduated: boolean;
  collectable: bigint;
  /** Fees accrued on the curve and not yet swept to the escrow by Pons. */
  accruing: bigint;
}

const ZERO = "0x0000000000000000000000000000000000000000" as const;

const tokenMetaAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "logo", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "socials", stateMutability: "view", inputs: [], outputs: [{ type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }, { type: "string" }] },
] as const;

type RawCabinet = {
  token: Address;
  curve: Address;
  vault: Address;
  creator: Address;
  game: number;
  potBps: number;
  roundLength: number;
  launchedAt: bigint;
  roundStart: bigint;
  round: number;
  pot: bigint;
  bestScore: bigint;
  bestPlayer: Address;
  collected: bigint;
  paidOut: bigint;
  minHold: bigint;
};

const PER_CABINET = 8;

function detailContracts(raw: readonly RawCabinet[]) {
  return raw.flatMap((c) => [
    { address: c.token, abi: tokenMetaAbi, functionName: "name", chainId: robinhoodChain.id } as const,
    { address: c.token, abi: tokenMetaAbi, functionName: "symbol", chainId: robinhoodChain.id } as const,
    { address: c.token, abi: tokenMetaAbi, functionName: "logo", chainId: robinhoodChain.id } as const,
    { address: c.token, abi: tokenMetaAbi, functionName: "description", chainId: robinhoodChain.id } as const,
    { address: c.curve, abi: curveAbi, functionName: "getReserves", chainId: robinhoodChain.id } as const,
    { address: c.curve, abi: curveAbi, functionName: "graduated", chainId: robinhoodChain.id } as const,
    { address: c.curve, abi: curveAbi, functionName: "quoteFeeBalance", chainId: robinhoodChain.id } as const,
    { address: c.token, abi: tokenMetaAbi, functionName: "socials", chainId: robinhoodChain.id } as const,
  ]);
}

type Detail = { status: "success" | "failure"; result?: unknown }[] | undefined;

function assemble(raw: readonly RawCabinet[], details: Detail, collectables: Detail): CabinetView[] {
  return raw.map((c, i) => {
    const d = details?.slice(i * PER_CABINET, (i + 1) * PER_CABINET) ?? [];
    const str = (k: number, fallback: string) => (d[k]?.status === "success" ? String(d[k]!.result) : fallback);
    const reserves = d[4]?.status === "success" ? (d[4]!.result as readonly [bigint, bigint]) : null;
    const graduated = d[5]?.status === "success" ? Boolean(d[5]!.result) : false;
    const accruing = d[6]?.status === "success" ? (d[6]!.result as bigint) : 0n;
    const collectable = collectables?.[i]?.status === "success" ? (collectables[i]!.result as bigint) : 0n;
    const socials = d[7]?.status === "success" ? [...(d[7]!.result as readonly string[])] : [];
    return {
      token: c.token,
      curve: c.curve,
      vault: c.vault,
      creator: c.creator,
      game: Number(c.game),
      potBps: Number(c.potBps),
      roundLength: Number(c.roundLength),
      launchedAt: Number(c.launchedAt),
      roundStart: Number(c.roundStart),
      round: Number(c.round),
      pot: c.pot,
      bestScore: c.bestScore,
      bestPlayer: c.bestPlayer,
      collected: c.collected,
      paidOut: c.paidOut,
      minHold: c.minHold,
      name: str(0, "token"),
      symbol: str(1, "???"),
      logo: str(2, ""),
      description: str(3, ""),
      socials,
      accent: accentFromExtra(socials[4]) ?? accentFor(c.token),
      reserves,
      graduated,
      collectable,
      accruing,
    };
  });
}

const REFRESH = 12_000;

/** Every cabinet, newest first (up to `limit`). */
export function useCabinets(limit = 60) {
  const enabled = Boolean(PAD);
  const count = useReadContract({
    address: PAD,
    abi: padAbi,
    functionName: "count",
    chainId: robinhoodChain.id,
    query: { enabled, refetchInterval: REFRESH },
  });
  const n = count.data ?? 0n;
  const page = useReadContract({
    address: PAD,
    abi: padAbi,
    functionName: "page",
    args: [0n, BigInt(Math.min(limit, Number(n)))],
    chainId: robinhoodChain.id,
    query: { enabled: enabled && n > 0n, refetchInterval: REFRESH },
  });
  const raw = useMemo(() => (page.data ?? []) as readonly RawCabinet[], [page.data]);
  const details = useReadContracts({
    allowFailure: true,
    contracts: detailContracts(raw),
    query: { enabled: raw.length > 0, refetchInterval: REFRESH },
  });
  const collectables = useReadContracts({
    allowFailure: true,
    contracts: raw.map((c) => ({ address: PAD!, abi: padAbi, functionName: "collectable", args: [c.token], chainId: robinhoodChain.id }) as const),
    query: { enabled: raw.length > 0, refetchInterval: REFRESH },
  });
  const cabinets = useMemo(() => assemble(raw, details.data as Detail, collectables.data as Detail), [raw, details.data, collectables.data]);
  return {
    configured: enabled,
    count: Number(n),
    cabinets,
    isLoading: enabled && (count.isLoading || (n > 0n && (page.isLoading || details.isLoading))),
    error: count.error ?? page.error ?? null,
    refetch: () => {
      count.refetch();
      page.refetch();
      details.refetch();
      collectables.refetch();
    },
  };
}

/** One cabinet by token address. */
export function useCabinet(token: Address | undefined) {
  const enabled = Boolean(PAD && token);
  const cab = useReadContract({
    address: PAD,
    abi: padAbi,
    functionName: "cabinet",
    args: [token ?? ZERO],
    chainId: robinhoodChain.id,
    query: { enabled, refetchInterval: 6_000, retry: 0 },
  });
  const raw = useMemo(() => (cab.data && (cab.data as RawCabinet).token !== ZERO ? [cab.data as RawCabinet] : []), [cab.data]);
  const details = useReadContracts({
    allowFailure: true,
    contracts: detailContracts(raw),
    query: { enabled: raw.length > 0, refetchInterval: 6_000 },
  });
  const collectable = useReadContracts({
    allowFailure: true,
    contracts: raw.map((c) => ({ address: PAD!, abi: padAbi, functionName: "collectable", args: [c.token], chainId: robinhoodChain.id }) as const),
    query: { enabled: raw.length > 0, refetchInterval: 6_000 },
  });
  const view = useMemo(() => assemble(raw, details.data as Detail, collectable.data as Detail)[0] ?? null, [raw, details.data, collectable.data]);
  return {
    configured: Boolean(PAD),
    cabinet: view,
    isLoading: enabled && cab.isLoading,
    notFound: enabled && !cab.isLoading && !cab.error && raw.length === 0,
    error: cab.error ?? null,
    refetch: () => {
      cab.refetch();
      details.refetch();
      collectable.refetch();
    },
  };
}

/** Pad-wide totals: pots open, paid out, fees collected. */
export function totals(cabinets: CabinetView[]) {
  return cabinets.reduce(
    (t, c) => ({ pot: t.pot + c.pot, paidOut: t.paidOut + c.paidOut, collected: t.collected + c.collected }),
    { pot: 0n, paidOut: 0n, collected: 0n },
  );
}

let ethUsdCache: { at: number; value: number } | null = null;

/** ETH/USD spot from Coinbase, cached a minute; null when unreachable. */
export function useEthUsd(): number | null {
  const [value, setValue] = useState<number | null>(ethUsdCache?.value ?? null);
  useEffect(() => {
    let alive = true;
    async function load() {
      if (ethUsdCache && Date.now() - ethUsdCache.at < 60_000) {
        setValue(ethUsdCache.value);
        return;
      }
      try {
        const r = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot");
        const j = (await r.json()) as { data?: { amount?: string } };
        const v = Number(j.data?.amount);
        if (alive && Number.isFinite(v)) {
          ethUsdCache = { at: Date.now(), value: v };
          setValue(v);
        }
      } catch {
        /* no quote: amounts show in ETH */
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return value;
}
