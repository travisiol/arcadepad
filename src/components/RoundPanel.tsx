"use client";

import { useState } from "react";
import type { Hex } from "viem";
import { useAccount, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { padAbi } from "@/lib/abi/generated";
import { robinhoodChain } from "@/lib/chain";
import { PAD, PAD_BPS } from "@/lib/contracts";
import { formatUnitsTrim } from "@/lib/curvemath";
import { explainError } from "@/lib/errors";
import { shortAddress, usd } from "@/lib/format";
import type { CabinetView } from "@/lib/market";
import { erc20Abi } from "@/lib/ponsAbi";
import { countdown, useNow } from "@/lib/useNow";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

/** The pot, the clock, the record, and the two buttons anyone can press. */
export function RoundPanel({ c, ethUsd, onChanged }: { c: CabinetView; ethUsd: number | null; onChanged: () => void }) {
  const now = useNow();
  const { address, isConnected, chainId } = useAccount();
  const onChain = isConnected && chainId === robinhoodChain.id;
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Hex | undefined>();
  const { writeContractAsync, isPending } = useWriteContract();
  const client = usePublicClient({ chainId: robinhoodChain.id });
  const { data: balance } = useReadContract({ address: c.token, abi: erc20Abi, functionName: "balanceOf", args: [address ?? ZERO], chainId: robinhoodChain.id, query: { enabled: Boolean(address), refetchInterval: 8_000 } });
  const { data: claimable } = useReadContract({ address: PAD, abi: padAbi, functionName: "claimable", args: [address ?? ZERO], chainId: robinhoodChain.id, query: { enabled: Boolean(address && PAD), refetchInterval: 8_000 } });

  const end = c.roundStart + c.roundLength;
  const due = now > 0 && now >= end;
  const potEth = Number(formatUnitsTrim(c.pot, 18, 6));
  const holds = balance !== undefined && balance >= c.minHold;

  async function call(fn: "collect" | "settle" | "withdraw") {
    if (!PAD || !client) return;
    setNote(null);
    try {
      const hash: Hex = await writeContractAsync(fn === "withdraw" ? { address: PAD, abi: padAbi, functionName: "withdraw", chainId: robinhoodChain.id } : { address: PAD, abi: padAbi, functionName: fn, args: [c.token], chainId: robinhoodChain.id });
      setPending(hash);
      setNote(`${fn} sent · ${shortAddress(hash, 8)}`);
      const receipt = await client.waitForTransactionReceipt({ hash });
      setNote(receipt.status === "success" ? `${fn}: done.` : `${fn}: the transaction reverted.`);
      onChanged();
    } catch (e) {
      setNote(explainError(e));
    } finally {
      setPending(undefined);
    }
  }

  const busy = isPending || Boolean(pending);

  return (
    <div className="panel p-5" style={{ borderColor: c.accent }}>
      <div className="flex items-baseline justify-between">
        <h2 className="pixel text-[12px] uppercase text-ink">the pot</h2>
        <span className="label">round {c.round}</span>
      </div>
      <div className="led mt-3 text-[26px] leading-none">{formatUnitsTrim(c.pot, 18, 4)} Ξ</div>
      <div className="mt-1 text-[12px] text-ink-3">{ethUsd ? `${usd(potEth * ethUsd)} · ` : ""}goes to the high score at the bell</div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="panel-inset p-3">
          <dt className="label">bell in</dt>
          <dd className="led mt-1 text-[13px]">{now === 0 ? "—" : due ? "rang" : countdown(end - now)}</dd>
          <dd className="mt-1 text-[10px] text-ink-3">{due ? "settles on the next play or collect" : `every ${Math.round(c.roundLength / 86400)} days`}</dd>
        </div>
        <div className="panel-inset p-3">
          <dt className="label">high score</dt>
          <dd className="led mt-1 text-[13px]">{c.bestScore.toString()}</dd>
          <dd className="mono mt-1 text-[10px] text-ink-3">{c.bestPlayer !== ZERO ? shortAddress(c.bestPlayer) : "nobody yet"}</dd>
        </div>
      </dl>

      <div className="mt-4 text-[12px] leading-relaxed text-ink-3">
        To post a score, hold <span className="mono text-ink-2">{formatUnitsTrim(c.minHold, 18, 0)} ${c.symbol}</span> (0.01% of the supply).
        {address ? (
          <span className={holds ? " text-green" : " text-orange"}> you hold {formatUnitsTrim(balance ?? 0n, 18, 0)} — {holds ? "you can post." : "not enough yet."}</span>
        ) : null}
      </div>

      <div className="mt-4 space-y-2 text-[12px]">
        <div className="flex justify-between"><span className="text-ink-3">swept, waiting to be collected</span><span className="mono">{formatUnitsTrim(c.collectable, 18, 5)} Ξ</span></div>
        <div className="flex justify-between"><span className="text-ink-3">accruing on the curve (pons sweeps it)</span><span className="mono">{formatUnitsTrim(c.accruing, 18, 5)} Ξ</span></div>
        <div className="flex justify-between"><span className="text-ink-3">collected so far · paid to players</span><span className="mono">{formatUnitsTrim(c.collected, 18, 4)} · {formatUnitsTrim(c.paidOut, 18, 4)} Ξ</span></div>
        <div className="flex flex-wrap justify-between gap-x-3"><span className="text-ink-3">every collected fee</span><span className="mono">pad {PAD_BPS / 100}% · pot {c.potBps / 100}% · creator {(10000 - PAD_BPS - c.potBps) / 100}%</span></div>
      </div>

      {onChain ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-line btn-sm" disabled={busy || c.collectable === 0n} onClick={() => call("collect")} title="pull swept fees into the split">
            collect fees
          </button>
          <button type="button" className="btn btn-line btn-sm" disabled={busy || !due} onClick={() => call("settle")} title="ring the bell: pay the pot to the high score">
            settle round
          </button>
          {claimable && claimable > 0n ? (
            <button type="button" className="btn btn-green btn-sm" disabled={busy} onClick={() => call("withdraw")}>
              withdraw {formatUnitsTrim(claimable, 18, 4)} Ξ
            </button>
          ) : null}
        </div>
      ) : null}
      {note ? <p className="mt-3 text-[12px] text-cyan">{note}</p> : null}
    </div>
  );
}
