import type { Address, Hex } from "viem";
import type { InputChange } from "@/game/types";

/**
 * The browser's side of the referee (src/app/api/referee/route.ts).
 * A run starts with a seed the referee issued and ends with the referee
 * replaying it and signing the score for ArcadePad.postScore.
 */

export interface RefereeStatus {
  online: boolean;
  referee: Address | null;
  pad: Address | null;
}

export interface StartedRun {
  seed: Hex;
  issuedAt: number;
  ticket: Hex;
}

export interface SignedScore {
  score: number;
  round: number;
  deadline: number;
  signature: Hex;
  referee: Address;
  ticks: number;
  reason: string;
}

export class RefereeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/referee", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new RefereeError(json.error ?? `referee error ${res.status}`, res.status);
  return json;
}

export async function refereeStatus(): Promise<RefereeStatus> {
  try {
    const res = await fetch("/api/referee", { method: "GET" });
    return (await res.json()) as RefereeStatus;
  } catch {
    return { online: false, referee: null, pad: null };
  }
}

export function startRun(token: Address, player: Address): Promise<StartedRun> {
  return call<StartedRun>({ op: "start", token, player });
}

export function verifyRun(args: { token: Address; player: Address; seed: Hex; issuedAt: number; ticket: Hex; inputs: InputChange[] }): Promise<SignedScore> {
  return call<SignedScore>({ op: "verify", ...args });
}
