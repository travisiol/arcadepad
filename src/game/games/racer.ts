import { Rng } from "../rng";
import { C, clearScreen, drawSprite, drawText, drawToken, rect, textWidth, type Sprite } from "../pixel";
import { HZ, LEFT, RIGHT, type BaseState, type GameDef, type Input, type Skin } from "../types";

/**
 * RACER — three lanes, no brakes.
 *
 * 160×144, a 96px road with three 32px lanes. The road scrolls faster the
 * further you go; every car you pass is 100 points, every token you pick
 * up 250, every 16px of road is one. Left/right hop a lane. Touch a car
 * and the run is over.
 */

const W = 160;
const H = 144;
const FP = 16;
const ROAD_X = 32;
const ROAD_W = 96;
const LANES = 3;
const LANE_W = ROAD_W / LANES;
const CAR_W = 16;
const CAR_H = 24;
const PLAYER_Y = 108;
const HUD = 12;

interface Car {
  lane: number;
  y: number; // fp, top edge; grows as it scrolls down
  kind: number;
  passed: boolean;
}

interface Coin {
  lane: number;
  y: number; // fp
}

export interface RacerState extends BaseState {
  rngState: number;
  x: number; // player x, px (left edge)
  lane: number;
  dist: number; // fp px
  speed: number; // fp px per tick
  cars: Car[];
  coins: Coin[];
  nextSpawn: number; // dist (fp) at which the next car appears
  lastLane: number;
  passed: number;
  picked: number;
  crashAt: number;
  pickAt: number;
}

function laneX(lane: number): number {
  return ROAD_X + lane * LANE_W + (LANE_W - CAR_W) / 2;
}

function init(seed: number): RacerState {
  return {
    tick: 0,
    score: 0,
    over: false,
    reason: "",
    prev: 0,
    rngState: seed >>> 0,
    x: laneX(1),
    lane: 1,
    dist: 0,
    speed: 20,
    cars: [],
    coins: [],
    nextSpawn: 60 * FP,
    lastLane: 1,
    passed: 0,
    picked: 0,
    crashAt: -100,
    pickAt: -100,
  };
}

function gapFor(speed: number): number {
  // Enough road to change lanes between two cars, at any speed: a hop
  // takes 16 ticks at 2px, i.e. speed×16 px of road, plus a car length.
  return (speed * 16) / FP + CAR_H + 24;
}

function step(s: RacerState, input: Input): void {
  if (s.over) return;
  s.tick++;
  if (s.tick >= racer.maxTicks) {
    s.over = true;
    s.reason = "time";
    return;
  }
  // Lane hops on press.
  if (input & LEFT && !(s.prev & LEFT) && s.lane > 0) s.lane--;
  if (input & RIGHT && !(s.prev & RIGHT) && s.lane < LANES - 1) s.lane++;
  s.prev = input;
  const tx = laneX(s.lane);
  if (s.x < tx) s.x = Math.min(tx, s.x + 2);
  else if (s.x > tx) s.x = Math.max(tx, s.x - 2);

  // Faster with distance: 1.25 px/tick at the start, 5 px/tick after ~36k px (~4 min).
  s.speed = Math.min(80, 20 + Math.floor(s.dist / FP / 600));
  s.dist += s.speed;

  // Scroll the cars, count the passes, drop the ones off screen.
  for (const car of s.cars) {
    car.y += s.speed;
    if (!car.passed && car.y / FP > PLAYER_Y + CAR_H) {
      car.passed = true;
      s.passed++;
      s.score += 100;
    }
  }
  s.cars = s.cars.filter((c) => c.y / FP < H + CAR_H);
  for (const coin of s.coins) coin.y += s.speed;
  s.coins = s.coins.filter((c) => c.y / FP < H);

  // Spawn: one car per gap, never in the same lane twice in a row so a
  // straight line always exists between two cars.
  if (s.dist >= s.nextSpawn) {
    const rng = new Rng(s.rngState);
    let lane = rng.int(LANES);
    if (lane === s.lastLane) lane = (lane + 1 + rng.int(LANES - 1)) % LANES;
    const kind = rng.int(3);
    s.cars.push({ lane, y: -CAR_H * FP, kind, passed: false });
    // Half the time a token sits in another lane, a little behind the car.
    if (rng.int(2) === 0) {
      const coinLane = (lane + 1 + rng.int(LANES - 1)) % LANES;
      s.coins.push({ lane: coinLane, y: -(CAR_H + 20) * FP });
    }
    s.rngState = rng.state;
    s.lastLane = lane;
    s.nextSpawn = s.dist + gapFor(s.speed) * FP;
  }

  // Pick-ups.
  const keptCoins: Coin[] = [];
  for (const coin of s.coins) {
    const cx = laneX(coin.lane) + 4;
    const cy = coin.y / FP;
    if (s.x + CAR_W > cx && s.x < cx + 8 && PLAYER_Y + CAR_H > cy && PLAYER_Y < cy + 8) {
      s.picked++;
      s.pickAt = s.tick;
      continue;
    }
    keptCoins.push(coin);
  }
  s.coins = keptCoins;

  s.score = s.passed * 100 + s.picked * 250 + Math.floor(s.dist / FP / 16);

  // Collision, with a 2px forgiveness on each side.
  for (const car of s.cars) {
    const cx = laneX(car.lane);
    const cy = car.y / FP;
    if (s.x + CAR_W - 2 > cx + 2 && s.x + 2 < cx + CAR_W - 2 && PLAYER_Y + CAR_H - 2 > cy + 2 && PLAYER_Y + 2 < cy + CAR_H - 2) {
      s.over = true;
      s.reason = "crash";
      s.crashAt = s.tick;
      return;
    }
  }
}

// ───────────────────────────────────────────── bot ──

function laneBlocked(s: RacerState, lane: number, ahead: number): boolean {
  for (const car of s.cars) {
    if (car.lane !== lane) continue;
    const cy = car.y / FP;
    if (cy + CAR_H > PLAYER_Y - ahead && cy < PLAYER_Y + CAR_H) return true;
  }
  return false;
}

function bot(s: RacerState): Input {
  if (s.over) return 0;
  // Release between presses so the hop registers as an edge.
  if (s.prev & (LEFT | RIGHT)) return 0;
  if (s.x !== laneX(s.lane)) return 0;
  const look = 40 + (s.speed * 20) / FP;
  if (!laneBlocked(s, s.lane, look)) {
    // Clear road: drift toward a token in a neighbouring lane if that lane is clear too.
    for (const coin of s.coins) {
      const cy = coin.y / FP;
      if (cy > PLAYER_Y - look || cy < PLAYER_Y - look - 60 || Math.abs(coin.lane - s.lane) !== 1) continue;
      if (laneBlocked(s, coin.lane, look + 24)) continue;
      return coin.lane < s.lane ? LEFT : RIGHT;
    }
    return 0;
  }
  const options = [s.lane - 1, s.lane + 1].filter((l) => l >= 0 && l < LANES && !laneBlocked(s, l, look + 16));
  if (options.length === 0) return 0;
  const to = options.length === 2 ? (s.tick & 1 ? options[0] : options[1]) : options[0];
  return to < s.lane ? LEFT : RIGHT;
}

// ───────────────────────────────────────────── render ──

const CAR: Sprite = [
  "....XXXXXXXX....",
  "...XXXXXXXXXX...",
  "..XXWWWWWWWWXX..",
  ".KXXWWWWWWWWXXK.",
  ".KXXXXXXXXXXXXK.",
  ".KXXXXXXXXXXXXK.",
  "..XXXXXXXXXXXX..",
  "..XXSSSSSSSSXX..",
  "..XXSSSSSSSSXX..",
  "..XXSSSSSSSSXX..",
  "..XXXXXXXXXXXX..",
  "..XXXXXXXXXXXX..",
  ".KXXXXXXXXXXXXK.",
  ".KXXXXXXXXXXXXK.",
  ".KXXXXXXXXXXXXK.",
  "..XXXXXXXXXXXX..",
  "..XXXXXXXXXXXX..",
  "..XXWWWWWWWWXX..",
  ".KXXWWWWWWWWXXK.",
  ".KXXXXXXXXXXXXK.",
  ".KXXXXXXXXXXXXK.",
  "..XXRRXXXXRRXX..",
  "...XXXXXXXXXX...",
  "....XXXXXXXX....",
];

const KINDS = [C.red, C.purple, C.blue] as const;

function render(ctx: CanvasRenderingContext2D, s: RacerState, skin: Skin, frame: number): void {
  clearScreen(ctx, W, H, "#0a2a12");
  // Grass with scrolling ticks.
  const off = Math.floor(s.dist / FP) % 32;
  for (let y = -32 + off; y < H; y += 32) {
    rect(ctx, 8, y, 4, 8, "#0d3a18");
    rect(ctx, W - 12, y + 16, 4, 8, "#0d3a18");
  }
  // Road.
  rect(ctx, ROAD_X, 0, ROAD_W, H, "#2a2436");
  for (let y = -16 + off; y < H; y += 16) {
    rect(ctx, ROAD_X - 3, y, 3, 8, C.red);
    rect(ctx, ROAD_X - 3, y + 8, 3, 8, C.white);
    rect(ctx, ROAD_X + ROAD_W, y, 3, 8, C.white);
    rect(ctx, ROAD_X + ROAD_W, y + 8, 3, 8, C.red);
  }
  for (let l = 1; l < LANES; l++) {
    const x = ROAD_X + l * LANE_W - 1;
    for (let y = -24 + off; y < H; y += 24) rect(ctx, x, y, 2, 12, "#f0f0f0");
  }
  // Tokens on the road.
  for (const coin of s.coins) drawToken(ctx, skin, laneX(coin.lane) + 4, Math.round(coin.y / FP), 8);
  // Traffic.
  for (const car of s.cars) {
    const col = KINDS[car.kind];
    drawSprite(ctx, CAR, laneX(car.lane), Math.round(car.y / FP), { X: col, W: "#1a1a2a", K: C.ink, S: "#ffffffaa", R: C.yellow });
  }
  // Player: the token's car, token on the roof.
  const crashed = s.over && s.reason === "crash";
  drawSprite(ctx, CAR, s.x, PLAYER_Y, { X: crashed && (frame >> 2) & 1 ? C.white : skin.accent, W: "#1a1a2a", K: C.ink, S: skin.accent, R: C.red });
  drawToken(ctx, skin, s.x + 4, PLAYER_Y + 7, 8);
  // HUD.
  rect(ctx, 0, 0, W, HUD, C.ink);
  rect(ctx, 0, HUD - 1, W, 1, skin.accent);
  drawText(ctx, skin.symbol.slice(0, 8), 3, 3, skin.accent, 1);
  const sc = String(s.score).padStart(6, "0");
  drawText(ctx, sc, W / 2 - textWidth(sc) / 2, 3, C.white, 1);
  const kmh = `${Math.round((s.speed / FP) * 60)}`;
  drawText(ctx, `${kmh} KMH`, W - 3 - textWidth(`${kmh} KMH`), 3, C.grey, 1);
  if (s.tick - s.pickAt < 20) drawText(ctx, "+250", s.x, PLAYER_Y - 8 - (s.tick - s.pickAt) / 4, C.yellow, 1);
  if (s.over) {
    rect(ctx, 20, 56, W - 40, 40, C.ink);
    rect(ctx, 20, 56, W - 40, 1, skin.accent);
    rect(ctx, 20, 95, W - 40, 1, skin.accent);
    drawText(ctx, s.reason === "crash" ? "CRASHED" : "TIME UP", W / 2 - textWidth(s.reason === "crash" ? "CRASHED" : "TIME UP", 2) / 2, 62, C.white, 2);
    const line = `${s.passed} PASSED ${s.picked} TOKENS`;
    drawText(ctx, line, W / 2 - textWidth(line) / 2, 80, skin.accent, 1);
  }
}

export const racer: GameDef<RacerState> = {
  id: "racer",
  name: "Racer",
  tagline: "three lanes. no brakes. don't touch anyone.",
  controls: "left / right to hop a lane",
  scoring: "100 per car you pass, 250 per token you pick up, plus the road behind you. it only gets faster.",
  accent: C.yellow,
  W,
  H,
  maxTicks: HZ * 60 * 15,
  init,
  step,
  bot,
  render,
};
