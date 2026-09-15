import type { Address } from "viem";

/** The EIP-712 message the referee signs and ArcadePad.postScore verifies. */
export const SCORE_TYPES = {
  Score: [
    { name: "cabinet", type: "address" },
    { name: "player", type: "address" },
    { name: "round", type: "uint256" },
    { name: "score", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function scoreDomain(chainId: number, pad: Address) {
  return { name: "ArcadePad", version: "1", chainId, verifyingContract: pad } as const;
}
