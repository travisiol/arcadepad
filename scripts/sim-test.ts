/**
 * Drives every cabinet headlessly: the bot plays a full run through the
 * Recorder (what the browser does), the referee's replay() must land on the
 * same score, twice. No canvas, no DOM — the simulations are pure.
 *
 *   npm run test:games
 */
import { GAMES } from "../src/game/registry";
import { MAX_INPUT_CHANGES, Recorder, replay, validateInputs } from "../src/game/replay";
import type { BaseState, GameDef, InputChange } from "../src/game/types";

let checks = 0;
let failed = 0;

function ok(cond: boolean, msg: string): void {
  checks++;
  if (!cond) {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

function botRun(def: GameDef<BaseState>, seed: number): { inputs: InputChange[]; state: BaseState } {
  const state = def.init(seed);
  const rec = new Recorder(def, state);
  while (!state.over && state.tick < def.maxTicks) rec.next(def.bot(state));
  return { inputs: rec.inputs, state };
}

for (const def of GAMES) {
  console.log(`${def.name} (${def.W}×${def.H}, ${def.maxTicks} ticks max)`);
  const seeds = [1, 42, 0xdeadbeef, 7777, 123456];
  let totalTicks = 0;
  const t0 = Date.now();
  for (const seed of seeds) {
    const { inputs, state } = botRun(def, seed);
    const a = replay(def, seed, inputs);
    const b = replay(def, seed, inputs);
    ok(state.over || state.tick >= def.maxTicks, `${def.id}/${seed}: the run ended`);
    ok(a.score === state.score && a.ticks === state.tick && a.over === state.over, `${def.id}/${seed}: replay matches the live run (${a.score} vs ${state.score})`);
    ok(b.score === a.score && b.ticks === a.ticks, `${def.id}/${seed}: replay is deterministic`);
    ok(state.score > 0, `${def.id}/${seed}: the bot scored (${state.score})`);
    ok(inputs.length <= MAX_INPUT_CHANGES, `${def.id}/${seed}: input log within the cap (${inputs.length})`);
    totalTicks += state.tick;
    // A different seed with the same inputs must not be accepted as the same run.
    const c = replay(def, seed + 1, inputs);
    ok(!(c.score === a.score && c.ticks === a.ticks && a.ticks > 100), `${def.id}/${seed}: another seed gives another run`);
    console.log(`  seed ${seed}: ${state.tick} ticks (${(state.tick / 60).toFixed(0)} s), ${inputs.length} input changes, score ${state.score}, ended by ${state.reason}`);
  }
  const ms = Date.now() - t0;
  console.log(`  ${((totalTicks * 3) / Math.max(1, ms) / 1000).toFixed(1)} M ticks/s replayed`);

  // No input at all: the run still ends by itself.
  const idle = replay(def, 99, []);
  ok(idle.over, `${def.id}: an idle run ends (${idle.reason} after ${idle.ticks} ticks)`);
  ok(idle.ticks <= def.maxTicks, `${def.id}: an idle run respects the cap`);
}

// The referee's input validation.
const anyDef = GAMES[0];
let threw = 0;
for (const bad of [
  [[2, 1], [1, 1]],
  [[1, 32]],
  [[0, 1]],
  [[1, 1], [1, 2]],
  [[anyDef.maxTicks + 1, 1]],
  [[1]],
] as unknown as InputChange[][]) {
  try {
    validateInputs(bad, anyDef.maxTicks);
  } catch {
    threw++;
  }
}
ok(threw === 6, `validateInputs rejects the six malformed logs (${threw}/6)`);
try {
  validateInputs(Array.from({ length: MAX_INPUT_CHANGES + 1 }, (_, i) => [i + 1, 1] as InputChange), 1e9);
  ok(false, "validateInputs rejects an oversized log");
} catch {
  ok(true, "validateInputs rejects an oversized log");
}

// A human-shaped Snake run: a few turns, then a wall.
{
  const def = GAMES[0];
  const r = replay(def, 5, [[1, 4], [40, 2], [80, 8]]);
  ok(r.over && r.reason === "crash", `snake: scripted turns end in a crash (${r.reason} at ${r.ticks})`);
}

console.log(`\n${checks - failed}/${checks} checks passed`);
if (failed) process.exit(1);
