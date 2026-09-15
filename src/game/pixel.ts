/**
 * Pixel-art helpers for the cabinet screens. Everything is drawn with
 * 1-logical-pixel rectangles into a small canvas that CSS scales up with
 * `image-rendering: pixelated`, so a sprite of 16 rows is a big sprite.
 */

import type { Skin } from "./types";

export type Sprite = readonly string[];
export type Palette = Record<string, string>;

/** Electric palette shared by every cabinet. */
export const C = {
  black: "#07050f",
  ink: "#120c24",
  white: "#ffffff",
  grey: "#8a86a8",
  dark: "#2a2144",
  magenta: "#ff2bd6",
  cyan: "#19f0ff",
  yellow: "#ffe600",
  green: "#39ff14",
  orange: "#ff7a00",
  red: "#ff2f4f",
  purple: "#8a3cff",
  blue: "#2f6bff",
  pink: "#ff8ae8",
} as const;

export function drawSprite(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, palette: Palette, flipX = false): void {
  for (let r = 0; r < sprite.length; r++) {
    const row = sprite[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const color = palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x + (flipX ? row.length - 1 - c : c), y + r, 1, 1);
    }
  }
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** A 1px frame. */
export function frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  rect(ctx, x, y, w, 1, color);
  rect(ctx, x, y + h - 1, w, 1, color);
  rect(ctx, x, y, 1, h, color);
  rect(ctx, x + w - 1, y, 1, h, color);
}

// ───────────────────────────────────────────── 3×5 font ──

const GLYPHS: Record<string, readonly string[]> = {
  "0": ["XXX", "X.X", "X.X", "X.X", "XXX"],
  "1": [".X.", "XX.", ".X.", ".X.", "XXX"],
  "2": ["XXX", "..X", "XXX", "X..", "XXX"],
  "3": ["XXX", "..X", "XXX", "..X", "XXX"],
  "4": ["X.X", "X.X", "XXX", "..X", "..X"],
  "5": ["XXX", "X..", "XXX", "..X", "XXX"],
  "6": ["XXX", "X..", "XXX", "X.X", "XXX"],
  "7": ["XXX", "..X", ".X.", ".X.", ".X."],
  "8": ["XXX", "X.X", "XXX", "X.X", "XXX"],
  "9": ["XXX", "X.X", "XXX", "..X", "XXX"],
  A: [".X.", "X.X", "XXX", "X.X", "X.X"],
  B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  C: ["XXX", "X..", "X..", "X..", "XXX"],
  D: ["XX.", "X.X", "X.X", "X.X", "XX."],
  E: ["XXX", "X..", "XX.", "X..", "XXX"],
  F: ["XXX", "X..", "XX.", "X..", "X.."],
  G: ["XXX", "X..", "X.X", "X.X", "XXX"],
  H: ["X.X", "X.X", "XXX", "X.X", "X.X"],
  I: ["XXX", ".X.", ".X.", ".X.", "XXX"],
  J: ["..X", "..X", "..X", "X.X", "XXX"],
  K: ["X.X", "X.X", "XX.", "X.X", "X.X"],
  L: ["X..", "X..", "X..", "X..", "XXX"],
  M: ["X.X", "XXX", "XXX", "X.X", "X.X"],
  N: ["XX.", "X.X", "X.X", "X.X", "X.X"],
  O: ["XXX", "X.X", "X.X", "X.X", "XXX"],
  P: ["XXX", "X.X", "XXX", "X..", "X.."],
  Q: ["XXX", "X.X", "X.X", "XXX", "..X"],
  R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
  S: ["XXX", "X..", "XXX", "..X", "XXX"],
  T: ["XXX", ".X.", ".X.", ".X.", ".X."],
  U: ["X.X", "X.X", "X.X", "X.X", "XXX"],
  V: ["X.X", "X.X", "X.X", "X.X", ".X."],
  W: ["X.X", "X.X", "XXX", "XXX", "X.X"],
  X: ["X.X", "X.X", ".X.", "X.X", "X.X"],
  Y: ["X.X", "X.X", ".X.", ".X.", ".X."],
  Z: ["XXX", "..X", ".X.", "X..", "XXX"],
  " ": ["...", "...", "...", "...", "..."],
  ".": ["...", "...", "...", "...", ".X."],
  ":": ["...", ".X.", "...", ".X.", "..."],
  "-": ["...", "...", "XXX", "...", "..."],
  "!": [".X.", ".X.", ".X.", "...", ".X."],
  "$": [".X.", "XXX", "XX.", ".XX", "XXX"],
  "/": ["..X", "..X", ".X.", "X..", "X.."],
  "×": ["...", "X.X", ".X.", "X.X", "..."],
  "<": ["..X", ".X.", "X..", ".X.", "..X"],
  ">": ["X..", ".X.", "..X", ".X.", "X.."],
  "'": [".X.", ".X.", "...", "...", "..."],
  "?": ["XXX", "..X", ".XX", "...", ".X."],
};

/** Width in logical px of `text` at scale 1 (3px glyphs + 1px spacing). */
export function textWidth(text: string, scale = 1): number {
  return Math.max(0, text.length * 4 - 1) * scale;
}

/** Draws `text` in the 3×5 font. Lowercase is drawn as uppercase. */
export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, scale = 1): void {
  ctx.fillStyle = color;
  // Whole pixels only: a half-pixel origin would blur every glyph.
  let cx = Math.round(x);
  y = Math.round(y);
  for (const raw of text.toUpperCase()) {
    const g = GLYPHS[raw] ?? GLYPHS["?"];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (g[r][c] === "X") ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
      }
    }
    cx += 4 * scale;
  }
}

export function drawTextCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, color: string, scale = 1): void {
  drawText(ctx, text, Math.round(cx - textWidth(text, scale) / 2), y, color, scale);
}

// ───────────────────────────────────────────── token skin ──

const COIN: Sprite = [
  ".....XXXXXX.....",
  "...XXWWWWXXXX...",
  "..XWWXXXXXXXXX..",
  ".XWXXXXXXXXXXXX.",
  ".XWXXXXXXXXXXXX.",
  "XWXXXXXXXXXXXXXX",
  "XWXXXXXXXXXXXXXX",
  "XWXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXXX",
  "XXXXXXXXXXXXXXSX",
  ".XXXXXXXXXXXXSX.",
  ".XXXXXXXXXXXSSX.",
  "..XXXXXXXXXSSX..",
  "...XXXXSSSSXX...",
  ".....XXXXXX.....",
];

/**
 * The token on screen: its pixelated logo when the page built one, else a
 * coin in the token's colour stamped with the first letter of its ticker.
 * `size` is 8, 12 or 16 logical pixels.
 */
export function drawToken(ctx: CanvasRenderingContext2D, skin: Skin, x: number, y: number, size: number): void {
  if (skin.logo) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skin.logo, x, y, size, size);
    return;
  }
  const scale = size / 16;
  if (scale === 1) {
    drawSprite(ctx, COIN, x, y, { X: skin.accent, W: C.white, S: C.ink });
  } else {
    // Downscaled coin: sample the 16px sprite.
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const ch = COIN[Math.floor(r / scale)][Math.floor(c / scale)];
        if (ch === ".") continue;
        ctx.fillStyle = ch === "W" ? C.white : ch === "S" ? C.ink : skin.accent;
        ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }
  const letter = (skin.symbol || "?").replace(/^\$/, "").slice(0, 1) || "?";
  if (size >= 12) drawTextCentered(ctx, letter, x + size / 2, y + Math.round(size / 2) - 2, C.ink, 1);
}

/** Fills the whole screen with the cabinet black plus a faint grid. */
export function clearScreen(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string = C.black): void {
  rect(ctx, 0, 0, w, h, bg);
}
