import { Rng } from "../rng";
import { C, clearScreen, drawSprite, drawText, drawToken, rect, textWidth, type Sprite } from "../pixel";
import { FIRE, HZ, LEFT, RIGHT, type BaseState, type GameDef, type Input, type Skin } from "../types";

/**
 * INVADERS — the paper hands are coming down.
 *
 * 160×144. A 6×4 formation of 12×8 invaders marches sideways and drops a
 * row at each wall; it speeds up as it thins out. One shot on screen at a
 * time. Rows pay 40/30/20/10 times the wave. Three ships.
 */

const W = 160;
const H = 144;
const HUD = 12;
const COLS = 6;
const ROWS = 4;
const INV_W = 12;
const INV_H = 8;
const GAP_X = 18;
const GAP_Y = 12;
const SHIP_W = 12;
const SHIP_H = 8;
const SHIP_Y = 128;
const ROW_SCORE = [40, 30, 20, 10] as const;

interface Shot {
  x: number;
  y: number;
}

export interface InvadersState extends BaseState {
  rngState: number;
  x: number; // ship left edge
  ox: number; // formation origin
  oy: number;
  dir: number; // 1 right, -1 left
  alive: number[]; // 1/0 per invader, row-major
  left: number;
  moveAt: number;
  anim: number; // 0/1 sprite frame, flips per formation step
  shot: Shot | null;
  bombs: Shot[];
  bombAt: number;
  lives: number;
  wave: number;
  invulnUntil: number;
  hitAt: number;
  hitX: number;
  hitY: number;
}

function formation(s: InvadersState): void {
  s.alive = new Array(COLS * ROWS).fill(1);
  s.left = COLS * ROWS;
  s.ox = 20;
  s.oy = HUD + 8 + Math.min(24, (s.wave - 1) * 4);
  s.dir = 1;
  s.bombs = [];
  s.shot = null;
  s.moveAt = s.tick + 40;
  s.bombAt = s.tick + 60;
}

function init(seed: number): InvadersState {
  const s: InvadersState = {
    tick: 0,
    score: 0,
    over: false,
    reason: "",
    prev: 0,
    rngState: seed >>> 0,
    x: (W - SHIP_W) / 2,
    ox: 0,
    oy: 0,
    dir: 1,
    alive: [],
    left: 0,
    moveAt: 0,
    anim: 0,
    shot: null,
    bombs: [],
    bombAt: 0,
    lives: 3,
    wave: 1,
    invulnUntil: 0,
    hitAt: -100,
    hitX: 0,
    hitY: 0,
  };
  formation(s);
  return s;
}

function invX(s: InvadersState, c: number): number {
  return s.ox + c * GAP_X;
}

function invY(s: InvadersState, r: number): number {
  return s.oy + r * GAP_Y;
}

/** Ticks between formation steps: brisk with few invaders left. */
function pace(s: InvadersState): number {
  return Math.max(3, Math.floor(2 + (s.left * 28) / (COLS * ROWS)) - Math.min(6, (s.wave - 1) * 2));
}

function step(s: InvadersState, input: Input): void {
  if (s.over) return;
  s.tick++;
  if (s.tick >= invaders.maxTicks) {
    s.over = true;
    s.reason = "time";
    return;
  }
  if (input & LEFT) s.x = Math.max(0, s.x - 2);
  if (input & RIGHT) s.x = Math.min(W - SHIP_W, s.x + 2);
  if (input & FIRE && !(s.prev & FIRE) && !s.shot) s.shot = { x: s.x + SHIP_W / 2, y: SHIP_Y - 4 };
  s.prev = input;

  // The shot.
  if (s.shot) {
    s.shot.y -= 4;
    if (s.shot.y < HUD) s.shot = null;
    else {
      // Bottom-up so a shot hits the lowest invader in its column first.
      outer: for (let r = ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
          if (!s.alive[r * COLS + c]) continue;
          const ix = invX(s, c);
          const iy = invY(s, r);
          if (s.shot.x >= ix && s.shot.x < ix + INV_W && s.shot.y < iy + INV_H && s.shot.y + 4 > iy) {
            s.alive[r * COLS + c] = 0;
            s.left--;
            s.score += ROW_SCORE[r] * s.wave;
            s.hitAt = s.tick;
            s.hitX = ix;
            s.hitY = iy;
            s.shot = null;
            break outer;
          }
        }
      }
    }
  }

  if (s.left === 0) {
    s.wave++;
    formation(s);
    return;
  }

  // Formation march.
  if (s.tick >= s.moveAt) {
    s.moveAt = s.tick + pace(s);
    s.anim ^= 1;
    let minC = COLS;
    let maxC = -1;
    let maxR = -1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!s.alive[r * COLS + c]) continue;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r > maxR) maxR = r;
      }
    }
    const nextLeft = invX(s, minC) + s.dir * 4;
    const nextRight = invX(s, maxC) + INV_W + s.dir * 4;
    if (nextLeft < 2 || nextRight > W - 2) {
      s.dir = -s.dir;
      s.oy += 6;
    } else {
      s.ox += s.dir * 4;
    }
    if (invY(s, maxR) + INV_H >= SHIP_Y) {
      s.over = true;
      s.reason = "invaded";
      return;
    }
  }

  // Bombs from the lowest invader of a random living column.
  if (s.tick >= s.bombAt) {
    const rng = new Rng(s.rngState);
    s.bombAt = s.tick + Math.max(20, 70 - s.wave * 8) + rng.int(30);
    const cols: number[] = [];
    for (let c = 0; c < COLS; c++) for (let r = ROWS - 1; r >= 0; r--) if (s.alive[r * COLS + c]) { cols.push(r * COLS + c); break; }
    if (cols.length) {
      const idx = cols[rng.int(cols.length)];
      const r = Math.floor(idx / COLS);
      const c = idx % COLS;
      s.bombs.push({ x: invX(s, c) + INV_W / 2, y: invY(s, r) + INV_H });
    }
    s.rngState = rng.state;
  }
  const kept: Shot[] = [];
  for (const b of s.bombs) {
    b.y += 2;
    if (b.y >= H) continue;
    const hitShip = b.y + 4 > SHIP_Y && b.y < SHIP_Y + SHIP_H && b.x >= s.x && b.x < s.x + SHIP_W;
    if (hitShip && s.tick >= s.invulnUntil) {
      s.lives--;
      s.invulnUntil = s.tick + 90;
      s.hitAt = s.tick;
      s.hitX = s.x;
      s.hitY = SHIP_Y;
      if (s.lives <= 0) {
        s.over = true;
        s.reason = "lives";
        return;
      }
      continue;
    }
    if (hitShip) continue;
    kept.push(b);
  }
  s.bombs = kept;
}

// ───────────────────────────────────────────── bot ──

function bot(s: InvadersState): Input {
  if (s.over) return 0;
  const cx = s.x + SHIP_W / 2;
  // Dodge a bomb about to land on the ship.
  for (const b of s.bombs) {
    if (b.y > SHIP_Y - 28 && b.y < SHIP_Y + SHIP_H && Math.abs(b.x - cx) < 9) {
      return b.x >= cx ? (s.x > 4 ? LEFT : RIGHT) : s.x < W - SHIP_W - 4 ? RIGHT : LEFT;
    }
  }
  // Nearest living column, by its lowest invader.
  let best = -1;
  let bestD = Infinity;
  for (let c = 0; c < COLS; c++) {
    let lowest = -1;
    for (let r = ROWS - 1; r >= 0; r--) if (s.alive[r * COLS + c]) { lowest = r; break; }
    if (lowest < 0) continue;
    const tx = invX(s, c) + INV_W / 2 + s.dir * 3;
    const d = Math.abs(tx - cx) + lowest * 2;
    if (d < bestD) {
      bestD = d;
      best = tx;
    }
  }
  if (best < 0) return 0;
  let input = 0;
  if (best > cx + 2) input |= RIGHT;
  else if (best < cx - 2) input |= LEFT;
  if (Math.abs(best - cx) <= 6 && !s.shot && !(s.prev & FIRE)) input |= FIRE;
  return input;
}

// ───────────────────────────────────────────── render ──

const INVADER_A: Sprite = [
  "..X......X..",
  "...X....X...",
  "..XXXXXXXX..",
  ".XX.XXXX.XX.",
  "XXXXXXXXXXXX",
  "X.XXXXXXXX.X",
  "X.X......X.X",
  "...XX..XX...",
];
const INVADER_B: Sprite = [
  "..X......X..",
  "X..X....X..X",
  "X.XXXXXXXX.X",
  "XXX.XXXX.XXX",
  "XXXXXXXXXXXX",
  ".XXXXXXXXXX.",
  "..X......X..",
  ".X........X.",
];
const SHIP: Sprite = [
  ".....XX.....",
  "....XXXX....",
  "....XXXX....",
  ".XXXXXXXXXX.",
  "XXXXXXXXXXXX",
  "XXXXXXXXXXXX",
  "XXXXXXXXXXXX",
  "XX.XXXXXX.XX",
];
const ROW_COLORS = [C.magenta, C.purple, C.cyan, C.green] as const;

function render(ctx: CanvasRenderingContext2D, s: InvadersState, skin: Skin, frame: number): void {
  clearScreen(ctx, W, H);
  // Stars.
  for (let i = 0; i < 24; i++) {
    const x = (i * 37 + 11) % W;
    const y = HUD + ((i * 53 + (frame >> 3)) % (H - HUD));
    rect(ctx, x, y, 1, 1, i % 3 === 0 ? C.grey : C.dark);
  }
  // Invaders.
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!s.alive[r * COLS + c]) continue;
      drawSprite(ctx, s.anim ? INVADER_B : INVADER_A, invX(s, c), invY(s, r), { X: ROW_COLORS[r] });
    }
  }
  if (s.tick - s.hitAt < 5) {
    rect(ctx, s.hitX - 1, s.hitY - 1, INV_W + 2, INV_H + 2, C.white);
  }
  // Bombs and the shot.
  for (const b of s.bombs) rect(ctx, b.x, b.y, 1, 4, C.red);
  if (s.shot) rect(ctx, s.shot.x, s.shot.y, 1, 4, C.yellow);
  // Ship in the token colour, the token as its cockpit.
  const blink = s.tick < s.invulnUntil && (s.tick >> 2) & 1;
  if (!blink) {
    drawSprite(ctx, SHIP, s.x, SHIP_Y, { X: skin.accent });
    drawToken(ctx, skin, s.x + 2, SHIP_Y + 1, 8);
  }
  // Ground line.
  rect(ctx, 0, H - 4, W, 1, skin.accent);
  // HUD.
  rect(ctx, 0, 0, W, HUD, C.ink);
  rect(ctx, 0, HUD - 1, W, 1, skin.accent);
  drawText(ctx, skin.symbol.slice(0, 8), 3, 3, skin.accent, 1);
  const sc = String(s.score).padStart(6, "0");
  drawText(ctx, sc, W / 2 - textWidth(sc) / 2, 3, C.white, 1);
  for (let i = 0; i < s.lives; i++) rect(ctx, W - 6 - i * 6, 4, 4, 4, skin.accent);
  drawText(ctx, `W${s.wave}`, W - 30, 3, C.grey, 1);
  if (s.over) {
    rect(ctx, 20, 56, W - 40, 40, C.ink);
    rect(ctx, 20, 56, W - 40, 1, skin.accent);
    rect(ctx, 20, 95, W - 40, 1, skin.accent);
    const title = s.reason === "invaded" ? "INVADED" : "GAME OVER";
    drawText(ctx, title, W / 2 - textWidth(title, 2) / 2, 62, C.white, 2);
    const line = `WAVE ${s.wave}  ${s.score} PTS`;
    drawText(ctx, line, W / 2 - textWidth(line) / 2, 80, skin.accent, 1);
  }
}

export const invaders: GameDef<InvadersState> = {
  id: "invaders",
  name: "Invaders",
  tagline: "the paper hands are coming down. hold the line.",
  controls: "left / right to move · fire to shoot",
  scoring: "40 for the top row down to 10 for the bottom, times the wave. one shot at a time.",
  accent: C.cyan,
  W,
  H,
  maxTicks: HZ * 60 * 15,
  init,
  step,
  bot,
  render,
};
