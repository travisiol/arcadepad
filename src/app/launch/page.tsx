import type { Metadata } from "next";
import { LaunchFormClient } from "@/components/LaunchFormClient";

export const metadata: Metadata = { title: "Launch a token + game" };

export default function LaunchPage() {
  return (
    <div className="py-10 sm:py-14">
      <p className="label">insert coin</p>
      <h1 className="pixel mt-3 text-[20px] leading-relaxed sm:text-[26px]">
        <span className="text-yellow">Launch a token.</span> <span className="text-magenta">Launch a game.</span>
      </h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">One transaction creates the token on Pons V2, its bonding curve, and its arcade cabinet. From then on, the creator fees of every trade split three ways: the pad, the cabinet&apos;s pot, you.</p>
      <div className="mt-10">
        <LaunchFormClient />
      </div>
    </div>
  );
}
