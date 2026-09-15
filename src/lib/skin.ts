import type { Skin } from "@/game/types";

/** The six electric colours a launch can pick for its cabinet. */
export const ACCENTS = [
  { id: "green", hex: "#39ff14", name: "electric green" },
  { id: "magenta", hex: "#ff2bd6", name: "hot magenta" },
  { id: "cyan", hex: "#19f0ff", name: "arcade cyan" },
  { id: "yellow", hex: "#ffe600", name: "coin yellow" },
  { id: "orange", hex: "#ff7a00", name: "neon orange" },
  { id: "pink", hex: "#ff8ae8", name: "bubblegum" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export function accentHex(id: string | undefined): string {
  return ACCENTS.find((a) => a.id === id)?.hex ?? ACCENTS[0].hex;
}

/**
 * The cabinet colour of a token is not stored on chain (Pons has no field
 * for it): it is derived from the token address, so every page agrees.
 */
export function accentFor(token: string): string {
  const n = parseInt(token.slice(-2), 16) || 0;
  return ACCENTS[n % ACCENTS.length].hex;
}

/**
 * Pons has no field for a cabinet colour, so a launch writes it into the
 * token's fifth social ("extra"): `arcadepad:v1;accent=magenta`.
 */
export function extraFor(accent: AccentId): string {
  return `arcadepad:v1;accent=${accent}`;
}

export function accentFromExtra(extra: string | undefined): string | null {
  const m = /arcadepad:v1;accent=([a-z]+)/.exec(extra ?? "");
  if (!m) return null;
  const found = ACCENTS.find((a) => a.id === m[1]);
  return found ? found.hex : null;
}

/** `ipfs://cid` → the gateway Pons itself serves from; https passes through. */
export function logoUrl(logo: string): string {
  const v = (logo ?? "").trim();
  if (!v) return "";
  if (v.startsWith("ipfs://")) {
    const cid = v.slice("ipfs://".length).replace(/^ipfs\//, "");
    return `https://www.ponsfamily.com/api/ipfs/content/${cid}?variant=card`;
  }
  if (/^https?:\/\//i.test(v)) return v;
  return "";
}

const cache = new Map<string, Promise<HTMLCanvasElement | null>>();

/**
 * Turns a logo into a 16×16 pixel sprite: the image is drawn small with
 * smoothing on (a proper box downscale), then shown big with smoothing
 * off. Any logo becomes pixel art. Null when it cannot be loaded (CORS,
 * 404, nothing set) — the games fall back to a coin in the token colour.
 */
export function loadLogoSprite(url: string, size = 16): Promise<HTMLCanvasElement | null> {
  if (!url || typeof document === "undefined") return Promise.resolve(null);
  const key = `${size}:${url}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Promise<HTMLCanvasElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = size;
        c.height = size;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        // Cover-fit into the square.
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - s) / 2;
        const sy = (img.naturalHeight - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        // Reading pixels back proves the canvas is not tainted.
        ctx.getImageData(0, 0, 1, 1);
        resolve(c);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(key, p);
  return p;
}

export function makeSkin(symbol: string, accent: string, logo?: CanvasImageSource | null): Skin {
  return { symbol: symbol.replace(/^\$/, "").toUpperCase().slice(0, 8) || "TOKEN", accent, logo: logo ?? null };
}
