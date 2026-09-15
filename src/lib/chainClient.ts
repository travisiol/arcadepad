import { createPublicClient, http, type PublicClient } from "viem";
import { robinhoodChain } from "./chain";

let client: PublicClient | null = null;

/** One viem client for reads outside React (the referee, scripts). */
export function chainClient(): PublicClient {
  if (!client) {
    client = createPublicClient({ chain: robinhoodChain, transport: http(robinhoodChain.rpcUrls.default.http[0], { batch: true }) });
  }
  return client;
}
