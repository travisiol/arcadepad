"use client";

import { useMemo, useState } from "react";
import type { Address, Hex } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { ConnectButton, useMounted } from "@/components/ConnectButton";
import { robinhoodChain } from "@/lib/chain";
import { BPS, buyImpactBps, formatUnitsTrim, parseDecimal, quoteBuy, quoteSell, sellImpactBps, withSlippage } from "@/lib/curvemath";
import { explainError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { curveAbi, erc20Abi } from "@/lib/ponsAbi";
import { site } from "@/lib/site";

const SLIPPAGE = [50n, 100n, 300n] as const;
const ZERO = "0x0000000000000000000000000000000000000000" as const;

/**
 * Buy and sell on the token's own Pons curve, from the cabinet. Quotes are
 * the curve's constant product computed locally from its reserves (checked
 * to the wei on a fork); the trade is a direct call to the curve — the pad
 * is not in the path. Pons' 1% fee is what feeds the pot.
 */
export function TradePanel({ token, curve, symbol, graduated, accent, onTraded }: { token: Address; curve: Address; symbol: string; graduated: boolean; accent: string; onTraded?: () => void }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<bigint>(100n);
  const [note, setNote] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Hex | undefined>();
  const mounted = useMounted();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === robinhoodChain.id;
  const account = address ?? ZERO;

  const { data: eth, refetch: refetchEth } = useBalance({ address, chainId: robinhoodChain.id, query: { enabled: Boolean(address) } });
  const { data: reads, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: curve, abi: curveAbi, functionName: "getReserves", chainId: robinhoodChain.id },
      { address: curve, abi: curveAbi, functionName: "feeBps", chainId: robinhoodChain.id },
      { address: curve, abi: curveAbi, functionName: "creatorTaxBps", chainId: robinhoodChain.id },
      { address: curve, abi: curveAbi, functionName: "currentSnipeTaxBps", args: [account], chainId: robinhoodChain.id },
      { address: token, abi: erc20Abi, functionName: "balanceOf", args: [account], chainId: robinhoodChain.id },
      { address: token, abi: erc20Abi, functionName: "allowance", args: [account, curve], chainId: robinhoodChain.id },
    ],
    query: { refetchInterval: 8_000 },
  });
  const reserves = reads?.[0]?.status === "success" ? (reads[0].result as readonly [bigint, bigint]) : null;
  const feeBps = reads?.[1]?.status === "success" ? (reads[1].result as bigint) : 100n;
  const creatorTax = reads?.[2]?.status === "success" ? (reads[2].result as bigint) : 0n;
  const snipeTax = reads?.[3]?.status === "success" ? (reads[3].result as bigint) : 0n;
  const tokenBalance = reads?.[4]?.status === "success" ? (reads[4].result as bigint) : 0n;
  const allowance = reads?.[5]?.status === "success" ? (reads[5].result as bigint) : 0n;

  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const inFlight = Boolean(pending);
  const status = note;

  const amountIn = useMemo(() => parseDecimal(amount), [amount]);
  const quote = useMemo(() => {
    if (!reserves || !amountIn || amountIn <= 0n) return null;
    const [q, t] = reserves;
    if (side === "buy") {
      const out = quoteBuy(q, t, amountIn, feeBps, creatorTax + snipeTax);
      const net = amountIn - (amountIn * (feeBps + creatorTax + snipeTax)) / BPS;
      return { out, impact: buyImpactBps(q, t, net, out), min: withSlippage(out, slippage) };
    }
    const out = quoteSell(q, t, amountIn, feeBps, creatorTax);
    return { out, impact: sellImpactBps(q, t, amountIn), min: withSlippage(out, slippage) };
  }, [reserves, amountIn, side, feeBps, creatorTax, snipeTax, slippage]);

  const needsApproval = side === "sell" && amountIn !== null && amountIn > 0n && allowance < amountIn;
  const insufficient = side === "buy" ? Boolean(eth && amountIn && amountIn > eth.value) : Boolean(amountIn && amountIn > tokenBalance);
  const heavy = quote !== null && quote.impact > 1_000n;
  const canTrade = mounted && onChain && amountIn !== null && amountIn > 0n && quote !== null && quote.out > 0n && !insufficient && !isPending && !inFlight;

  async function submit() {
    if (!address || !amountIn || !quote || !client) return;
    setNote(null);
    try {
      let hash: Hex;
      let what: string;
      if (side === "buy") {
        hash = await writeContractAsync({ address: curve, abi: curveAbi, functionName: "buy", args: [amountIn, quote.min, address], value: amountIn, chainId: robinhoodChain.id });
        what = "buy";
      } else if (needsApproval) {
        hash = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [curve, amountIn], chainId: robinhoodChain.id });
        what = "approval";
      } else {
        hash = await writeContractAsync({ address: curve, abi: curveAbi, functionName: "sell", args: [amountIn, quote.min, address], chainId: robinhoodChain.id });
        what = "sell";
      }
      setPending(hash);
      setNote({ kind: "info", text: `${what} sent · ${shortAddress(hash, 8)}` });
      const receipt = await client.waitForTransactionReceipt({ hash });
      setNote(
        receipt.status === "success"
          ? { kind: "info", text: `${what} confirmed · ${shortAddress(receipt.transactionHash, 8)}${what === "approval" ? " — now sell." : ""}` }
          : { kind: "error", text: `${what}: the transaction reverted.` },
      );
      refetch();
      refetchEth();
      onTraded?.();
    } catch (e) {
      setNote({ kind: "error", text: explainError(e) });
    } finally {
      setPending(undefined);
    }
  }

  if (graduated) {
    return (
      <div className="panel p-5">
        <h2 className="pixel text-[12px] uppercase text-ink">trade</h2>
        <p className="mt-3 text-sm text-ink-3">This token graduated: its market lives in the pool now, not on the curve this page reads.</p>
        <a href={`${site.ponsUrl}/token/${token}`} target="_blank" rel="noreferrer" className="btn btn-line btn-sm mt-4">
          trade on pons ↗
        </a>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="pixel text-[12px] uppercase text-ink">trade on the curve</h2>
        <div className="flex gap-1" role="tablist" aria-label="Side">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={side === s} className="btn btn-line btn-sm" style={side === s ? { background: s === "buy" ? "#39ff14" : "#ff2f4f", color: "#000" } : undefined} onClick={() => { setSide(s); setAmount(""); setNote(null); setPending(undefined); }}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <label className="mt-4 block">
        <span className="flex items-baseline justify-between">
          <span className="label">{side === "buy" ? "you pay · eth" : `you sell · ${symbol}`}</span>
          <button
            type="button"
            className="text-[11px] text-ink-3 hover:text-yellow"
            onClick={() => {
              if (side === "buy" && eth) {
                const spare = eth.value - 1_000_000_000_000_000n;
                setAmount(spare > 0n ? formatUnitsTrim(spare, 18, 6) : "0");
              } else if (side === "sell") setAmount(formatUnitsTrim(tokenBalance, 18, 18));
            }}
          >
            {side === "buy" ? (eth ? `${formatUnitsTrim(eth.value, 18, 4)} eth` : "—") : `${formatUnitsTrim(tokenBalance, 18, 0)} ${symbol}`} · max
          </button>
        </span>
        <input className="field mono mt-2 text-lg" inputMode="decimal" placeholder="0.0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={Boolean(amount && amountIn === null)} />
      </label>
      <dl className="mt-3 space-y-1 text-[13px]">
        <div className="flex justify-between"><dt className="text-ink-3">{side === "buy" ? `you get · ${symbol}` : "you get · eth"}</dt><dd className="mono">{quote ? formatUnitsTrim(quote.out, 18, side === "buy" ? 0 : 6) : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-3">minimum after slippage</dt><dd className="mono text-ink-2">{quote ? formatUnitsTrim(quote.min, 18, side === "buy" ? 0 : 6) : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-3">price impact</dt><dd className={`mono ${heavy ? "text-orange" : "text-ink-2"}`}>{quote ? `${(Number(quote.impact) / 100).toFixed(2)}%${heavy ? " · large" : ""}` : "—"}</dd></div>
        <div className="flex justify-between"><dt className="text-ink-3">fees (feed the pot)</dt><dd className="mono text-ink-2">{(Number(feeBps + creatorTax) / 100).toFixed(2)}%{side === "buy" && snipeTax > 0n ? ` + ${(Number(snipeTax) / 100).toFixed(0)}% snipe tax` : ""}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="label">slippage</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Slippage tolerance">
          {SLIPPAGE.map((s) => (
            <button key={String(s)} type="button" role="radio" aria-checked={slippage === s} className="btn btn-line btn-sm" style={slippage === s ? { background: accent, color: "#000" } : undefined} onClick={() => setSlippage(s)}>
              {(Number(s) / 100).toFixed(1)}%
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {!mounted ? null : !isConnected || !onChain ? (
          <ConnectButton size="md" />
        ) : (
          <button type="button" className={`btn w-full ${side === "buy" ? "btn-green" : "btn-magenta"}`} disabled={!canTrade} onClick={submit}>
            {isPending ? "confirm in wallet…" : inFlight ? "waiting for the block…" : side === "buy" ? `buy ${symbol}` : needsApproval ? `approve ${symbol}` : `sell ${symbol}`}
          </button>
        )}
        {status ? <p className={`mt-3 text-[12px] ${status.kind === "error" ? "text-red" : "text-cyan"}`}>{status.text}</p> : null}
      </div>
    </div>
  );
}
