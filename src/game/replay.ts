import type { BaseState, GameDef, Input, InputChange, ReplayResult } from "./types";

/**
 * Hard cap on an input log, on top of "one change per tick": a 15-minute
 * run at 60 Hz is 54 000 ticks, so nothing legitimate gets near it.
 */
export const MAX_INPUT_CHANGES = 60_000;

/**
 * Replays a run: same game, same seed, same input changes → same score.
 * Inputs must be sorted by tick, one change per tick at most, masks in
 * 0..31. Stops at game over or at the game's own time limit.
 */
export function replay(def: GameDef<BaseState>, seed: number, inputs: InputChange[]): ReplayResult {
  validateInputs(inputs, def.maxTicks);
  const s = def.init(seed >>> 0);
  let i = 0;
  let input: Input = 0;
  while (!s.over) {
    const nextTick = s.tick + 1;
    while (i < inputs.length && inputs[i][0] <= nextTick) {
      input = inputs[i][1];
      i++;
    }
    def.step(s, input);
    if (s.tick >= def.maxTicks) break;
  }
  return { score: s.score, ticks: s.tick, over: s.over, reason: s.reason };
}

export function validateInputs(inputs: InputChange[], maxTicks: number): void {
  if (!Array.isArray(inputs)) throw new Error("inputs must be an array");
  if (inputs.length > MAX_INPUT_CHANGES) throw new Error("too many input changes");
  let last = 0;
  for (const change of inputs) {
    if (!Array.isArray(change) || change.length !== 2) throw new Error("bad input change");
    const [tick, mask] = change;
    if (!Number.isInteger(tick) || tick < 1 || tick > maxTicks) throw new Error("bad input tick");
    if (!Number.isInteger(mask) || mask < 0 || mask > 31) throw new Error("bad input mask");
    if (tick <= last) throw new Error("inputs out of order");
    last = tick;
  }
}

/**
 * Records a live run tick by tick — the browser's side of the same
 * contract. `next(input)` applies the input for the coming tick and logs
 * it if it changed.
 */
export class Recorder {
  readonly inputs: InputChange[] = [];
  private last: Input = 0;

  constructor(private readonly def: GameDef<BaseState>, readonly state: BaseState) {}

  next(input: Input): void {
    if (this.state.over) return;
    const masked = input & 31;
    if (masked !== this.last) {
      this.inputs.push([this.state.tick + 1, masked]);
      this.last = masked;
    }
    this.def.step(this.state, masked);
  }
}
