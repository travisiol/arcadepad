/**
 * The arcade, the part shared by the browser and the referee.
 *
 * Every game is a deterministic simulation: integer state, a seeded PRNG,
 * a fixed tick rate, and one input bitmask per tick. A run is nothing but
 * (seed, list of input changes). The browser plays it live and records
 * the inputs; the referee replays the same code in Node and signs the
 * score it lands on. Rendering is separate and never touches the state.
 */

export const HZ = 60;

/** Input bits. A run's input log stores the whole mask at each change. */
export const LEFT = 1;
export const RIGHT = 2;
export const UP = 4;
export const DOWN = 8;
export const FIRE = 16;

export type Input = number;

export type GameId = "snake" | "breakout" | "racer" | "invaders";

export interface BaseState {
  tick: number;
  score: number;
  over: boolean;
  /** Why the run ended: "crash" | "lives" | "time" | "" */
  reason: string;
  /** Previous tick's input, for edge detection (press vs hold). */
  prev: Input;
}

/** What a token puts on the screen: its ticker, its colour, its logo. */
export interface Skin {
  symbol: string;
  accent: string;
  /** A 16×16 pixel version of the token's logo, if the page built one. */
  logo?: CanvasImageSource | null;
}

export interface GameDef<S extends BaseState = BaseState> {
  id: GameId;
  name: string;
  /** One line, lowercase, what you do. */
  tagline: string;
  /** Which keys do what, for the cabinet's control panel. */
  controls: string;
  /** How the score is made, in one sentence. */
  scoring: string;
  /** The cabinet's electric colour. */
  accent: string;
  /** Logical resolution. Big pixels: the canvas is scaled up, never resampled. */
  W: number;
  H: number;
  /** A run ends by itself after this many ticks ("time"). */
  maxTicks: number;
  init(seed: number): S;
  /** Advances one tick. Must be a pure function of (state, input). */
  step(s: S, input: Input): void;
  /** Attract-mode player, also the test driver. Deterministic in `s`. */
  bot(s: S): Input;
  render(ctx: CanvasRenderingContext2D, s: S, skin: Skin, frame: number): void;
}

/** An input change: from `tick` on, the mask is `input`. */
export type InputChange = [tick: number, input: Input];

export interface Run {
  game: GameId;
  seed: number;
  inputs: InputChange[];
}

export interface ReplayResult {
  score: number;
  ticks: number;
  over: boolean;
  reason: string;
}
