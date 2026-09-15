import { Recorder } from "./replay";
import { DOWN, FIRE, HZ, LEFT, RIGHT, UP, type BaseState, type GameDef, type Input, type InputChange, type Skin } from "./types";

export type RunnerMode = "attract" | "play";

export interface FinishedRun {
  seed: number;
  inputs: InputChange[];
  score: number;
  ticks: number;
  reason: string;
}

export interface RunnerOptions {
  mode: RunnerMode;
  seed: number;
  skin: Skin;
  onOver?: (run: FinishedRun) => void;
  onTick?: (state: BaseState) => void;
}

const KEYS: Record<string, Input> = {
  ArrowLeft: LEFT,
  ArrowRight: RIGHT,
  ArrowUp: UP,
  ArrowDown: DOWN,
  a: LEFT,
  d: RIGHT,
  w: UP,
  s: DOWN,
  A: LEFT,
  D: RIGHT,
  W: UP,
  S: DOWN,
  " ": FIRE,
  Enter: FIRE,
  x: FIRE,
  X: FIRE,
  z: FIRE,
  Z: FIRE,
};

/**
 * Runs a cabinet in the browser: a fixed 60 Hz simulation fed from the
 * keyboard (or the on-screen buttons), rendered every animation frame,
 * recorded by the Recorder so the finished run can be sent to the referee.
 * In attract mode the game's bot plays instead.
 */
export class Runner {
  readonly def: GameDef<BaseState>;
  readonly state: BaseState;
  private readonly recorder: Recorder;
  private readonly ctx: CanvasRenderingContext2D;
  private input: Input = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private frame = 0;
  private finished = false;
  private stopped = false;
  /** Ticks the simulation stops after in attract mode (keeps demos short). */
  attractLimit = HZ * 90;

  constructor(def: GameDef<BaseState>, canvas: HTMLCanvasElement, readonly opts: RunnerOptions) {
    this.def = def;
    canvas.width = def.W;
    canvas.height = def.H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.state = def.init(opts.seed >>> 0);
    this.recorder = new Recorder(def, this.state);
    this.draw();
  }

  get mode(): RunnerMode {
    return this.opts.mode;
  }

  get inputs(): InputChange[] {
    return this.recorder.inputs;
  }

  start(): void {
    this.stopped = false;
    this.last = performance.now();
    this.acc = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
  }

  /** Sets the held-input mask (bits from types.ts). */
  setInput(mask: Input): void {
    this.input = mask & 31;
  }

  press(bit: Input): void {
    this.input |= bit;
  }

  release(bit: Input): void {
    this.input &= ~bit;
  }

  /** Maps a keyboard event to an input bit, or 0. */
  static keyBit(e: KeyboardEvent): Input {
    return KEYS[e.key] ?? 0;
  }

  /** Advances the simulation by exactly one tick (tests, captures). */
  tick(): void {
    if (this.state.over) return;
    const input = this.opts.mode === "attract" ? this.def.bot(this.state) : this.input;
    this.recorder.next(input);
    this.opts.onTick?.(this.state);
    if (this.opts.mode === "attract" && !this.state.over && this.state.tick >= this.attractLimit) {
      this.state.over = true;
      this.state.reason = "demo";
    }
    if (this.state.over && !this.finished) {
      this.finished = true;
      this.opts.onOver?.({
        seed: this.opts.seed >>> 0,
        inputs: this.recorder.inputs.slice(),
        score: this.state.score,
        ticks: this.state.tick,
        reason: this.state.reason,
      });
    }
  }

  draw(): void {
    this.frame++;
    this.def.render(this.ctx, this.state, this.opts.skin, this.frame);
  }

  private loop = (now: number): void => {
    if (this.stopped) return;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    this.acc += dt;
    const step = 1000 / HZ;
    let n = 0;
    while (this.acc >= step && n < 8) {
      this.tick();
      this.acc -= step;
      n++;
    }
    if (n === 8) this.acc = 0;
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };
}

/** A seed for a local (unreferred) run: fresh every time. */
export function localSeed(): number {
  return (Math.random() * 0x100000000) >>> 0;
}
