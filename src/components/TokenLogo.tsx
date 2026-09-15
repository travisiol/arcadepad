"use client";

import { useState } from "react";
import { JoystickMark } from "./Wordmark";
import { logoUrl } from "@/lib/skin";

/** The token's logo, shown as pixels; a coin in its colour when there is none. */
export function TokenLogo({ logo, symbol, accent, size = 48, className = "" }: { logo: string; symbol: string; accent: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = logoUrl(logo);
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`${symbol} logo`} width={size} height={size} onError={() => setBroken(true)} className={`block border-[3px] border-black object-cover ${className}`} style={{ width: size, height: size, imageRendering: "pixelated", background: "#000" }} />;
  }
  return (
    <span className={`pixel flex items-center justify-center border-[3px] border-black text-black ${className}`} style={{ width: size, height: size, background: accent, fontSize: Math.max(8, size / 3) }} aria-label={`${symbol} logo`}>
      {symbol.replace(/^\$/, "").slice(0, 1) || <JoystickMark size={size / 2} />}
    </span>
  );
}
