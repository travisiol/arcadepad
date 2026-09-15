"use client";

import { ConnectButton as RainbowConnect } from "@rainbow-me/rainbowkit";
import { useSyncExternalStore } from "react";
import { shortAddress } from "@/lib/format";

const noop = () => () => {};

/** True after hydration — for anything that must not render on the server. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** RainbowKit's modal behind the site's own button. */
export function ConnectButton({ size = "sm" }: { size?: "sm" | "md" }) {
  const sz = size === "sm" ? "btn-sm" : "";
  return (
    <RainbowConnect.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;
        if (!mounted) {
          return (
            <button type="button" className={`btn btn-line ${sz}`} disabled aria-hidden>
              connect
            </button>
          );
        }
        if (!connected) {
          return (
            <button type="button" className={`btn btn-cyan ${sz}`} onClick={openConnectModal}>
              connect
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button type="button" className={`btn btn-magenta ${sz}`} onClick={openChainModal}>
              switch to robinhood chain
            </button>
          );
        }
        return (
          <button type="button" className={`btn btn-line ${sz}`} onClick={openAccountModal}>
            <span className="inline-block h-2 w-2 bg-green" />
            {shortAddress(account.address)}
          </button>
        );
      }}
    </RainbowConnect.Custom>
  );
}
