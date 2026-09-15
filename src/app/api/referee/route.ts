import { NextResponse } from "next/server";
import { concatHex, isAddress, keccak256, stringToHex, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gameByIndex } from "@/game/registry";
import { replay } from "@/game/replay";
import { toSeed } from "@/game/rng";
import type { InputChange } from "@/game/types";
import { padAbi } from "@/lib/abi/generated";
import { CHAIN_ID } from "@/lib/chain";
import { chainClient } from "@/lib/chainClient";
import { PAD } from "@/lib/contracts";
import { scoreDomain, SCORE_TYPES } from "@/lib/typedData";

/**
 * The referee.
 *
 * A cabinet score only counts on chain with the referee's signature, and
 * the referee only signs what it can reproduce: it replays the run — same
 * game code, same seed, same input log — in Node, and signs the score it
 * lands on, for the cabinet's current round, with a short deadline.
 *
 *   POST { op: "start",  token, player }              → { seed, issuedAt, ticket }
 *   POST { op: "verify", token, player, seed, issuedAt, ticket, inputs } → { score, round, deadline, signature }
 *   GET                                                → { online, referee, pad }
 *
 * Stateless: the seed is random, and `ticket` (a keyed hash over token,
 * player, seed, issuedAt) proves at verify time that this referee issued
 * this seed for this player, less than TICKET_TTL ago. No database.
 *
 * REFEREE_KEY (a private key) must be set; its address is the pad's
 * `referee`. Without it the endpoint answers 503 and the site plays for
 * free without posting scores.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_TTL_S = 2 * 3600;
const SIGNATURE_TTL_S = 15 * 60;
const MAX_BODY = 2_000_000;

function refereeKey(): Hex | null {
  const key = process.env.REFEREE_KEY?.trim();
  return key && /^0x[0-9a-fA-F]{64}$/.test(key) ? (key as Hex) : null;
}

function account() {
  const key = refereeKey();
  return key ? privateKeyToAccount(key) : null;
}

function ticketFor(secretKey: Hex, token: Address, player: Address, seed: Hex, issuedAt: number): Hex {
  const secret = keccak256(concatHex([secretKey, stringToHex("arcadepad:ticket")]));
  return keccak256(concatHex([secret, token, player, seed, toHex(issuedAt, { size: 8 })]));
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  const acct = account();
  return NextResponse.json({ online: Boolean(acct && PAD), referee: acct?.address ?? null, pad: PAD ?? null });
}

export async function POST(request: Request) {
  const key = refereeKey();
  const acct = account();
  if (!key || !acct) return bad("referee offline: REFEREE_KEY is not set", 503);
  if (!PAD) return bad("referee offline: the pad is not deployed", 503);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return bad("run too large", 413);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return bad("bad json");
  }
  const token = String(body.token ?? "");
  const player = String(body.player ?? "");
  if (!isAddress(token) || !isAddress(player)) return bad("token and player must be addresses");

  if (body.op === "start") {
    const seed = toHex(crypto.getRandomValues(new Uint8Array(4)));
    const issuedAt = Math.floor(Date.now() / 1000);
    return NextResponse.json({ seed, issuedAt, ticket: ticketFor(key, token, player, seed, issuedAt) });
  }

  if (body.op !== "verify") return bad("unknown op");
  const seed = String(body.seed ?? "");
  const issuedAt = Number(body.issuedAt);
  const ticket = String(body.ticket ?? "");
  if (!/^0x[0-9a-fA-F]{8}$/.test(seed)) return bad("bad seed");
  if (!Number.isInteger(issuedAt)) return bad("bad issuedAt");
  const now = Math.floor(Date.now() / 1000);
  if (now - issuedAt > TICKET_TTL_S || issuedAt > now + 60) return bad("this run's ticket expired — start a new run", 410);
  if (ticketFor(key, token, player, seed as Hex, issuedAt) !== ticket) return bad("bad ticket", 403);

  // The cabinet: which game, which round.
  let game: number;
  let round: number;
  try {
    const cab = await chainClient().readContract({ address: PAD, abi: padAbi, functionName: "cabinet", args: [token] });
    game = Number(cab.game);
    round = Number(cab.round);
    const end = Number(cab.roundStart) + Number(cab.roundLength);
    // Past the bell, the next on-chain touch settles and opens round + 1
    // (one settlement, however many bells were missed): sign for that one.
    if (now >= end) round += 1;
  } catch {
    return bad("no cabinet for this token", 404);
  }
  const def = gameByIndex(game);
  if (!def) return bad("unknown game", 500);

  let result;
  try {
    result = replay(def, toSeed(seed), body.inputs as InputChange[]);
  } catch (e) {
    return bad(`bad run: ${(e as Error).message}`);
  }
  if (!result.over) return bad("the run has not ended", 422);
  if (result.score === 0) return bad("a score of zero is not signed", 422);

  const deadline = now + SIGNATURE_TTL_S;
  const signature = await acct.signTypedData({
    domain: scoreDomain(CHAIN_ID, PAD),
    types: SCORE_TYPES,
    primaryType: "Score",
    message: { cabinet: token, player, round: BigInt(round), score: BigInt(result.score), deadline: BigInt(deadline) },
  });
  return NextResponse.json({ score: result.score, round, deadline, signature, referee: acct.address, ticks: result.ticks, reason: result.reason });
}
