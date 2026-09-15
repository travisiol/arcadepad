import { isAddress, type Address } from "viem";

/** Pons V2 on Robinhood Chain — verified on a fork, see README. */
export const PONS_FACTORY: Address = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
export const PONS_FORWARDER: Address = "0xe33e9e479df8802cb0866d5d05258bec4cf62948";
export const PONS_FEE_ESCROW: Address = "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e";

const raw = process.env.NEXT_PUBLIC_PAD?.trim() ?? "";

/**
 * The deployed ArcadePad. Set by NEXT_PUBLIC_PAD, or read by next.config.ts
 * from contracts/deployments/robinhood.json after `npm run deploy:robinhood`.
 * Undefined until then: the arcade plays, nothing can be launched.
 */
export const PAD: Address | undefined = isAddress(raw) ? (raw as Address) : undefined;

/** The block the pad was deployed at, so log scans start there. */
export const PAD_BLOCK = BigInt(process.env.NEXT_PUBLIC_PAD_BLOCK ?? "0");

/** Pons launch fee, display only; the pad reads the live value. */
export const LAUNCH_FEE_ETH_DISPLAY = process.env.NEXT_PUBLIC_LAUNCH_FEE_ETH ?? "0.0005";

/** The pad's cut of collected fees, mirrored from ArcadePad.PAD_BPS. */
export const PAD_BPS = 1000;
export const MIN_POT_BPS = 1000;
export const MAX_POT_BPS = 9000;
export const DEFAULT_POT_BPS = 5000;
export const MIN_ROUND_DAYS = 1;
export const MAX_ROUND_DAYS = 30;
export const DEFAULT_ROUND_DAYS = 7;
/** 0.01 % of the launch supply, mirrored from ArcadePad.HOLD_BPS. */
export const HOLD_BPS = 1;
