/** mulberry32 — a small, fast, seedable PRNG. Same bits in Node and in every browser. */
export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  /** Next 32-bit unsigned integer. */
  u32(): number {
    let t = (this.a += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return this.u32() % n;
  }

  /** The generator's state, so a state object can be cloned. */
  get state(): number {
    return this.a;
  }

  set state(v: number) {
    this.a = v >>> 0;
  }
}

/** A 32-bit seed from a hex string (the referee's seed) or any integer. */
export function toSeed(v: string | number): number {
  if (typeof v === "number") return v >>> 0;
  const hex = v.startsWith("0x") ? v.slice(2) : v;
  return parseInt(hex.slice(-8).padStart(8, "0"), 16) >>> 0;
}
