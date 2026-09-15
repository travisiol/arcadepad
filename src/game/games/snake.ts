import { Rng } from "../rng";
import { C, clearScreen, drawText, drawToken, rect, textWidth } from "../pixel";
import { DOWN, HZ, LEFT, RIGHT, UP, type BaseState, type GameDef, type Input, type Skin } from "../types";

/**
 * SNAKE — eat the token, don't eat yourself.
 *
 * 20×16 cells of 8px under a 16px HUD. The snake moves every `period`
 * ticks and speeds up every five tokens. Score: 10 per token plus the
 * speed level, so a fast snake scores more per bite.
 */

export const COLS = 20;
export const ROWS = 16;
const CELL = 8;
const HUD = 16;
const W = COLS * CELL;
const H = HUD + ROWS * CELL;

// dir: 0 up, 1 right, 2 down, 3 left
const DIR_DX = [0, 1, 0, -1] as const;
const DIR_DY = [-1, 0, 1, 0] as const;

export interface SnakeState extends BaseState {
  rngState: number;
  dir: number;
  want: number;
  /** Head first, as cell indexes y*COLS+x. */
  body: number[];
  food: number;
  grow: number;
  period: number;
  moveAt: number;
  eaten: number;
  level: number;
  /** Tick of the last bite, for the flash. */
  biteAt: number;
}

function cell(x: number, y: number): number {
  return y * COLS + x;
}

function spawnFood(s: SnakeState): number {
  const rng = new Rng(s.rngState);
  const taken = new Set(s.body);
  const free = COLS * ROWS - taken.size;
  let out = s.food;
  if (free > 0) {
    let n = rng.int(free);
    for (let i = 0; i < COLS * ROWS; i++) {
      if (taken.has(i)) continue;
      if (n === 0) {
        out = i;
        break;
      }
      n--;
    }
  }
  s.rngState = rng.state;
  return out;
}

function init(seed: number): SnakeState {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);
  const s: SnakeState = {
    tick: 0,
    score: 0,
    over: false,
    reason: "",
    prev: 0,
    rngState: seed >>> 0,
    dir: 1,
    want: 1,
    body: [cell(cx, cy), cell(cx - 1, cy), cell(cx - 2, cy)],
    food: 0,
    grow: 0,
    period: 9,
    moveAt: 9,
    eaten: 0,
    level: 1,
    biteAt: -100,
  };
  s.food = spawnFood(s);
  return s;
}

function wantFrom(input: Input, dir: number, want: number): number {
  // The last pressed direction wins; a reversal is ignored.
  let w = want;
  if (input & UP) w = 0;
  if (input & RIGHT) w = 1;
  if (input & DOWN) w = 2;
  if (input & LEFT) w = 3;
  if ((w + 2) % 4 === dir) return want;
  return w;
}

function step(s: SnakeState, input: Input): void {
  if (s.over) return;
  s.tick++;
  s.want = wantFrom(input, s.dir, s.want);
  s.prev = input;
  if (s.tick >= snake.maxTicks) {
    s.over = true;
    s.reason = "time";
    return;
  }
  if (s.tick < s.moveAt) return;
  s.moveAt = s.tick + s.period;
  s.dir = s.want;
  const head = s.body[0];
  const hx = (head % COLS) + DIR_DX[s.dir];
  const hy = Math.floor(head / COLS) + DIR_DY[s.dir];
  if (hx < 0 || hx >= COLS || hy < 0 || hy >= ROWS) {
    s.over = true;
    s.reason = "crash";
    return;
  }
  const next = cell(hx, hy);
  // The tail cell frees up this tick unless the snake is growing.
  const tailStays = s.grow > 0;
  const bodyToCheck = tailStays ? s.body : s.body.slice(0, -1);
  if (bodyToCheck.includes(next)) {
    s.over = true;
    s.reason = "crash";
    return;
  }
  s.body.unshift(next);
  if (next === s.food) {
    s.eaten++;
    s.score += 10 + s.level;
    s.grow += 1;
    s.biteAt = s.tick;
    if (s.eaten % 5 === 0 && s.period > 4) {
      s.period--;
      s.level++;
    }
    s.food = spawnFood(s);
  }
  if (s.grow > 0) s.grow--;
  else s.body.pop();
}

// ───────────────────────────────────────────── bot ──

function safe(s: SnakeState, dir: number): boolean {
  const head = s.body[0];
  const hx = (head % COLS) + DIR_DX[dir];
  const hy = Math.floor(head / COLS) + DIR_DY[dir];
  if (hx < 0 || hx >= COLS || hy < 0 || hy >= ROWS) return false;
  const next = cell(hx, hy);
  const body = s.grow > 0 ? s.body : s.body.slice(0, -1);
  return !body.includes(next);
}

/** Cells reachable from `start` without crossing the body — a trap detector. */
function room(s: SnakeState, start: number): number {
  const blocked = new Set(s.body);
  blocked.delete(s.body[s.body.length - 1]);
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % COLS;
    const y = Math.floor(c / COLS);
    for (let d = 0; d < 4; d++) {
      const nx = x + DIR_DX[d];
      const ny = y + DIR_DY[d];
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const n = cell(nx, ny);
      if (blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen.size;
}

const DIR_INPUT = [UP, RIGHT, DOWN, LEFT] as const;

function bot(s: SnakeState): Input {
  if (s.over) return 0;
  // Only think on the tick before a move; hold the choice otherwise.
  if (s.tick + 1 !== s.moveAt) return DIR_INPUT[s.want];
  const head = s.body[0];
  const hx = head % COLS;
  const hy = Math.floor(head / COLS);
  const fx = s.food % COLS;
  const fy = Math.floor(s.food / COLS);
  let best = s.dir;
  let bestKey = -Infinity;
  for (let d = 0; d < 4; d++) {
    if ((d + 2) % 4 === s.dir) continue;
    if (!safe(s, d)) continue;
    const nx = hx + DIR_DX[d];
    const ny = hy + DIR_DY[d];
    const dist = Math.abs(nx - fx) + Math.abs(ny - fy);
    const space = room(s, cell(nx, ny));
    // Never enter a pocket smaller than the snake; then prefer the shortest way.
    const key = (space >= s.body.length + 1 ? 1000 : space) * 100 - dist + (d === s.dir ? 1 : 0);
    if (key > bestKey) {
      bestKey = key;
      best = d;
    }
  }
  return DIR_INPUT[best];
}

// ───────────────────────────────────────────── render ──

function render(ctx: CanvasRenderingContext2D, s: SnakeState, skin: Skin, frame: number): void {
  clearScreen(ctx, W, H);
  // Board: a faint checker so the grid reads.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      rect(ctx, x * CELL, HUD + y * CELL, CELL, CELL, (x + y) % 2 === 0 ? "#0c0819" : "#0a0715");
    }
  }
  // HUD
  rect(ctx, 0, 0, W, HUD, C.ink);
  rect(ctx, 0, HUD - 1, W, 1, skin.accent);
  drawText(ctx, `${skin.symbol}`.slice(0, 8), 3, 3, skin.accent, 2);
  const sc = String(s.score).padStart(6, "0");
  drawText(ctx, sc, W - 3 - textWidth(sc, 2), 3, C.white, 2);
  drawText(ctx, `L${s.level}`, Math.round(W / 2) - 6, 5, C.grey, 1);

  // Food = the token.
  const fx = (s.food % COLS) * CELL;
  const fy = HUD + Math.floor(s.food / COLS) * CELL;
  const bob = (frame >> 4) & 1;
  drawToken(ctx, skin, fx, fy - bob, CELL);

  // Body, tail to head, in the token colour with a darker core.
  for (let i = s.body.length - 1; i >= 1; i--) {
    const c = s.body[i];
    const x = (c % COLS) * CELL;
    const y = HUD + Math.floor(c / COLS) * CELL;
    rect(ctx, x, y, CELL, CELL, skin.accent);
    rect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, i % 2 === 0 ? C.ink : "#1c1436");
  }
  const head = s.body[0];
  const hx = (head % COLS) * CELL;
  const hy = HUD + Math.floor(head / COLS) * CELL;
  const flash = s.tick - s.biteAt < 6;
  rect(ctx, hx, hy, CELL, CELL, flash ? C.white : skin.accent);
  // Eyes on the leading side.
  const ex = s.dir === 1 ? 5 : s.dir === 3 ? 1 : 2;
  const ey = s.dir === 2 ? 5 : s.dir === 0 ? 1 : 2;
  rect(ctx, hx + ex, hy + ey, 2, 2, C.ink);
  rect(ctx, hx + (s.dir % 2 === 0 ? ex + 3 : ex), hy + (s.dir % 2 === 0 ? ey : ey + 3), 2, 2, C.ink);

  if (s.over) overlay(ctx, s, skin);
}

function overlay(ctx: CanvasRenderingContext2D, s: SnakeState, skin: Skin): void {
  rect(ctx, 20, 56, W - 40, 40, C.ink);
  rect(ctx, 20, 56, W - 40, 1, skin.accent);
  rect(ctx, 20, 95, W - 40, 1, skin.accent);
  drawText(ctx, "GAME OVER", Math.round(W / 2 - textWidth("GAME OVER", 2) / 2), 62, C.white, 2);
  const line = `${s.eaten} EATEN  ${s.score} PTS`;
  drawText(ctx, line, Math.round(W / 2 - textWidth(line) / 2), 80, skin.accent, 1);
}

export const snake: GameDef<SnakeState> = {
  id: "snake",
  name: "Snake",
  tagline: "eat the token. don't eat yourself.",
  controls: "arrows / wasd / d-pad to turn",
  scoring: "10 points per token, plus the speed level. the snake speeds up every five.",
  accent: C.green,
  W,
  H,
  maxTicks: HZ * 60 * 15,
  init,
  step,
  bot,
  render,
};
