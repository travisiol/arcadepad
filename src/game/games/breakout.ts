import { Rng } from "../rng";
import { C, clearScreen, drawSprite, drawText, drawToken, rect, textWidth } from "../pixel";
import { FIRE, HZ, LEFT, RIGHT, type BaseState, type GameDef, type Input, type Skin } from "../types";

/**
 * BREAKOUT — break the sell walls.
 *
 * 160×144. Ten columns of bricks in six rows, a 24px paddle, a 4px ball
 * in 1/16 px fixed point. The ball speeds up after 4 and 12 paddle hits
 * and on every cleared wall. Top rows pay more. Three balls.
 */

const W = 160;
const H = 144;
const FP = 16;
const HUD = 12;
const COLS = 10;
const ROWS = 6;
const BW = 16;
const BH = 6;
const TOP = HUD + 8;
const PADDLE_W = 24;
const PADDLE_H = 3;
const PADDLE_Y = 134;
const BALL = 4;
const ROW_SCORE = [70, 50, 50, 30, 30, 10] as const;
/** Serve/hit zones across the paddle, in eighths of the speed. */
const ZONES: ReadonlyArray<readonly [number, number]> = [
  [-6, -5],
  [-4, -7],
  [-2, -8],
  [2, -8],
  [4, -7],
  [6, -5],
];

export interface BreakoutState extends BaseState {
  rngState: number;
  px: number; // paddle x, px
  bx: number; // ball x, fp
  by: number; // ball y, fp
  vx: number; // fp per tick
  vy: number;
  speed: number; // fp per tick magnitude
  serving: boolean;
  lives: number;
  level: number;
  hits: number;
  /** Paddle-hit count at the last brick hit; a bot reads it to break loops. */
  brickAtHit: number;
  /** Hits left per brick, row-major: 0 gone, 1 plain, 2 hard. */
  bricks: number[];
  left: number;
  hitAt: number;
  hitX: number;
  hitY: number;
}

/** A fresh wall: every brick up, plus a seeded handful of hard (two-hit) bricks. */
function buildWall(s: BreakoutState): void {
  s.bricks = new Array(COLS * ROWS).fill(1);
  s.left = COLS * ROWS;
  const rng = new Rng(s.rngState);
  const hard = Math.min(30, 6 + s.level * 3);
  for (let i = 0; i < hard; i++) s.bricks[rng.int(COLS * ROWS)] = 2;
  s.rngState = rng.state;
}

function serve(s: BreakoutState): void {
  s.serving = true;
  s.bx = (s.px + PADDLE_W / 2 - BALL / 2) * FP;
  s.by = (PADDLE_Y - BALL) * FP;
  s.vx = 0;
  s.vy = 0;
}

function init(seed: number): BreakoutState {
  const s: BreakoutState = {
    tick: 0,
    score: 0,
    over: false,
    reason: "",
    prev: 0,
    rngState: seed >>> 0,
    px: (W - PADDLE_W) / 2,
    bx: 0,
    by: 0,
    vx: 0,
    vy: 0,
    speed: 24, // 1.5 px per tick
    serving: true,
    lives: 3,
    level: 1,
    hits: 0,
    brickAtHit: 0,
    bricks: [],
    left: 0,
    hitAt: -100,
    hitX: 0,
    hitY: 0,
  };
  buildWall(s);
  serve(s);
  return s;
}

function launch(s: BreakoutState): void {
  const rng = new Rng(s.rngState);
  const z = ZONES[rng.int(ZONES.length)];
  s.rngState = rng.state;
  s.vx = (z[0] * s.speed) / 8;
  s.vy = (z[1] * s.speed) / 8;
  s.serving = false;
}

function speedUp(s: BreakoutState, to: number): void {
  if (s.speed >= to) return;
  const k = to / s.speed;
  s.speed = to;
  if (!s.serving) {
    s.vx = Math.trunc(s.vx * k);
    s.vy = Math.trunc(s.vy * k);
  }
}

function step(s: BreakoutState, input: Input): void {
  if (s.over) return;
  s.tick++;
  if (s.tick >= breakout.maxTicks) {
    s.over = true;
    s.reason = "time";
    return;
  }
  if (input & LEFT) s.px = Math.max(0, s.px - 3);
  if (input & RIGHT) s.px = Math.min(W - PADDLE_W, s.px + 3);

  if (s.serving) {
    s.bx = (s.px + PADDLE_W / 2 - BALL / 2) * FP;
    s.by = (PADDLE_Y - BALL) * FP;
    if (input & FIRE && !(s.prev & FIRE)) launch(s);
    s.prev = input;
    return;
  }
  s.prev = input;

  // Two sub-steps keep a fast ball from tunnelling through a 6px brick.
  for (let sub = 0; sub < 2; sub++) {
    s.bx += s.vx / 2;
    s.by += s.vy / 2;
    let x = s.bx / FP;
    let y = s.by / FP;

    if (x <= 0) {
      s.bx = 0;
      s.vx = Math.abs(s.vx);
    } else if (x >= W - BALL) {
      s.bx = (W - BALL) * FP;
      s.vx = -Math.abs(s.vx);
    }
    if (y <= HUD) {
      s.by = HUD * FP;
      s.vy = Math.abs(s.vy);
    }
    x = s.bx / FP;
    y = s.by / FP;

    // Paddle.
    if (s.vy > 0 && y + BALL >= PADDLE_Y && y + BALL <= PADDLE_Y + PADDLE_H + 2 && x + BALL > s.px && x < s.px + PADDLE_W) {
      const centre = x + BALL / 2 - s.px;
      const zone = Math.max(0, Math.min(ZONES.length - 1, Math.floor((centre * ZONES.length) / PADDLE_W)));
      s.vx = (ZONES[zone][0] * s.speed) / 8;
      s.vy = (ZONES[zone][1] * s.speed) / 8;
      s.by = (PADDLE_Y - BALL) * FP;
      s.hits++;
      if (s.hits === 4) speedUp(s, 28);
      if (s.hits === 12) speedUp(s, 34);
    }

    // Bricks.
    if (y < TOP + ROWS * BH && y + BALL > TOP) {
      const c0 = Math.max(0, Math.floor(x / BW));
      const c1 = Math.min(COLS - 1, Math.floor((x + BALL - 1) / BW));
      const r0 = Math.max(0, Math.floor((y - TOP) / BH));
      const r1 = Math.min(ROWS - 1, Math.floor((y + BALL - 1 - TOP) / BH));
      let hit = -1;
      for (let r = r0; r <= r1 && hit < 0; r++) {
        for (let c = c0; c <= c1; c++) {
          if (s.bricks[r * COLS + c]) {
            hit = r * COLS + c;
            break;
          }
        }
      }
      if (hit >= 0) {
        const r = Math.floor(hit / COLS);
        const c = hit % COLS;
        s.bricks[hit]--;
        if (s.bricks[hit] === 0) s.left--;
        s.score += ROW_SCORE[r] * s.level;
        s.brickAtHit = s.hits;
        s.hitAt = s.tick;
        s.hitX = c * BW;
        s.hitY = TOP + r * BH;
        // Side hit when the ball's previous x range did not overlap the brick.
        const prevX = (s.bx - s.vx / 2) / FP;
        const overlappedX = prevX + BALL > c * BW && prevX < c * BW + BW;
        if (overlappedX) s.vy = -s.vy;
        else s.vx = -s.vx;
        if (s.left === 0) {
          s.level++;
          buildWall(s);
          speedUp(s, Math.min(48, s.speed + 6));
          serve(s);
          return;
        }
      }
    }

    // Lost.
    if (y >= H) {
      s.lives--;
      if (s.lives <= 0) {
        s.over = true;
        s.reason = "lives";
        return;
      }
      s.hits = 0;
      s.speed = Math.max(24, s.speed - 4);
      serve(s);
      return;
    }
  }
}

// ───────────────────────────────────────────── bot ──

/** Where the ball will cross the paddle line if nothing is in the way. */
function landingX(s: BreakoutState): number {
  if (s.vy <= 0) return s.bx / FP + BALL / 2;
  const ticks = ((PADDLE_Y - BALL) * FP - s.by) / s.vy;
  let x = s.bx / FP + BALL / 2 + (s.vx / FP) * ticks;
  // Fold the walls.
  const span = W - BALL;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  if (x > span) x = 2 * span - x;
  return x;
}

/** Folds an x position into the screen, as a ball bouncing off the walls does. */
function fold(x: number): number {
  const span = W - BALL;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return x > span ? 2 * span - x : x;
}

function bot(s: BreakoutState): Input {
  if (s.over) return 0;
  if (s.serving) return s.tick % 30 === 0 ? FIRE : 0;
  // Meet the ball where it lands, in the paddle zone whose bounce carries
  // it into a column that still has bricks — the loop-breaker a player
  // does by feel. Zones near a wall may be out of reach; the nearest
  // reachable one is taken.
  const land = landingX(s);
  const ZW = PADDLE_W / ZONES.length;
  const kMax = Math.min(ZONES.length - 1, Math.floor(land / ZW - 0.5));
  const kMin = Math.max(0, Math.ceil((land - (W - PADDLE_W)) / ZW - 0.5));
  const wallBottom = TOP + ROWS * BH;
  let zone = 2 + (s.hits & 1);
  let bestKey = -Infinity;
  for (let k = kMin; k <= kMax; k++) {
    const vx = (ZONES[k][0] * s.speed) / 8 / FP;
    const vy = (-ZONES[k][1] * s.speed) / 8 / FP;
    const ticks = (PADDLE_Y - BALL - wallBottom) / vy;
    const col = Math.max(0, Math.min(COLS - 1, Math.floor(fold(land - BALL / 2 + vx * ticks) / BW)));
    let bricks = 0;
    let lowest = -1;
    for (let r = 0; r < ROWS; r++) {
      if (s.bricks[r * COLS + col]) {
        bricks += s.bricks[r * COLS + col];
        lowest = r;
      }
    }
    const key = bricks * 10 + lowest - Math.abs(k - 2.5) * 0.5;
    if (key > bestKey) {
      bestKey = key;
      zone = k;
    }
  }
  // Two paddle hits without a brick: the ball is in a loop. Wander.
  const stale = s.hits - s.brickAtHit;
  if (stale >= 2) zone = Math.max(kMin, Math.min(kMax, (s.hits * 7 + stale) % ZONES.length));
  const target = land - (zone + 0.5) * ZW;
  if (target > s.px + 1) return RIGHT;
  if (target < s.px - 1) return LEFT;
  return 0;
}

// ───────────────────────────────────────────── render ──

const BRICK_COLORS = [C.magenta, C.magenta, C.orange, C.orange, C.yellow, C.yellow] as const;

const HEART = ["X.X", "XXX", ".X."] as const;

function render(ctx: CanvasRenderingContext2D, s: BreakoutState, skin: Skin, frame: number): void {
  clearScreen(ctx, W, H);
  rect(ctx, 0, HUD, W, 1, C.dark);
  // Bricks: the sell walls.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const b = s.bricks[r * COLS + c];
      if (!b) continue;
      const x = c * BW;
      const y = TOP + r * BH;
      rect(ctx, x, y, BW - 1, BH - 1, BRICK_COLORS[r]);
      rect(ctx, x, y, BW - 1, 1, "#ffffff80");
      if (b === 2) {
        // Hard brick: a dark core.
        rect(ctx, x + 2, y + 2, BW - 5, BH - 4, C.ink);
      }
    }
  }
  // Hit flash.
  if (s.tick - s.hitAt < 4) rect(ctx, s.hitX, s.hitY, BW - 1, BH - 1, C.white);
  // Paddle in the token colour.
  rect(ctx, s.px, PADDLE_Y, PADDLE_W, PADDLE_H, skin.accent);
  rect(ctx, s.px, PADDLE_Y, PADDLE_W, 1, C.white);
  // Ball.
  const x = Math.round(s.bx / FP);
  const y = Math.round(s.by / FP);
  rect(ctx, x, y, BALL, BALL, C.white);
  rect(ctx, x + 1, y + 1, 1, 1, skin.accent);
  // HUD
  drawText(ctx, skin.symbol.slice(0, 8), 3, 3, skin.accent, 1);
  const sc = String(s.score).padStart(6, "0");
  drawText(ctx, sc, W / 2 - textWidth(sc) / 2, 3, C.white, 1);
  for (let i = 0; i < s.lives; i++) drawSprite(ctx, HEART, W - 5 - i * 5, 4, { X: C.red });
  drawText(ctx, `W${s.level}`, W - 26, 3, C.grey, 1);
  if (s.serving && !s.over) {
    if ((frame >> 4) & 1) drawText(ctx, "FIRE TO SERVE", W / 2 - textWidth("FIRE TO SERVE") / 2, 100, skin.accent, 1);
    drawToken(ctx, skin, W / 2 - 8, 76, 16);
  }
  if (s.over) {
    rect(ctx, 20, 56, W - 40, 40, C.ink);
    rect(ctx, 20, 56, W - 40, 1, skin.accent);
    rect(ctx, 20, 95, W - 40, 1, skin.accent);
    drawText(ctx, "GAME OVER", W / 2 - textWidth("GAME OVER", 2) / 2, 62, C.white, 2);
    const line = `WALL ${s.level}  ${s.score} PTS`;
    drawText(ctx, line, W / 2 - textWidth(line) / 2, 80, skin.accent, 1);
  }
}

export const breakout: GameDef<BreakoutState> = {
  id: "breakout",
  name: "Breakout",
  tagline: "break the sell walls. three balls.",
  controls: "left / right to move · fire to serve",
  scoring: "top rows pay 70, bottom rows 10, times the wall number. dark bricks take two hits and pay twice.",
  accent: C.magenta,
  W,
  H,
  maxTicks: HZ * 60 * 15,
  init,
  step,
  bot,
  render,
};
