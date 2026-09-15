/** `0xe06c…d0e7` */
export function shortAddress(address: string, chars = 4): string {
  if (!address || address.length < 2 + chars * 2) return address;
  return `${address.slice(0, 2 + chars)}…${address.slice(-chars)}`;
}

/** Base units → number (display only; precision loss is fine here). */
export function toNumber(value: bigint, decimals = 18): number {
  return Number(value) / 10 ** decimals;
}

/** `4.2k`, `1.2m`, `980`, `0.0042` */
export function compact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(digits)}b`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)}m`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(digits)}k`;
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 1) return value.toFixed(2);
  if (abs === 0) return "0";
  if (abs < 0.0001) return value.toExponential(1);
  return value.toFixed(4);
}

/** An amount in its pair asset: `4.20 eth`, `0.0042 gld`. */
export function amount(value: number, unit: string, digits?: number): string {
  if (!Number.isFinite(value)) return "—";
  if (digits !== undefined) return `${value.toFixed(digits)} ${unit.toLowerCase()}`;
  return `${compact(value, 2)} ${unit.toLowerCase()}`;
}

/** `$4.2k` or `—` without a quote. */
export function usd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${compact(value)}`;
}

/** A tiny per-token price: `4.2e-9 eth`. */
export function tinyPrice(value: number, unit: string): string {
  if (!Number.isFinite(value) || value === 0) return `0 ${unit.toLowerCase()}`;
  if (value < 0.001) return `${value.toExponential(2)} ${unit.toLowerCase()}`;
  return `${value.toFixed(4)} ${unit.toLowerCase()}`;
}

/** `20 395 755` — thin-space thousands, no decimals. */
export function tokenAmount(value: bigint, decimals = 18): string {
  const v = value / 10n ** BigInt(decimals);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/** `2 min ago`, `3 h ago`, `4 d ago` */
export function ago(unixSeconds: number, now = Date.now() / 1000): string {
  const s = Math.max(0, now - unixSeconds);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
