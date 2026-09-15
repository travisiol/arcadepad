import type { Metadata } from "next";
import { ArcadeGrid } from "@/components/ArcadeGrid";

export const metadata: Metadata = { title: "The arcade" };

export default function ArcadePage() {
  return (
    <div className="py-10 sm:py-14">
      <p className="label">the arcade</p>
      <h1 className="pixel mt-3 text-[20px] leading-relaxed sm:text-[26px]">Every cabinet on the pad</h1>
      <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-2">Newest first, read live from the chain. Pots are the tokens&apos; own trading fees. Free to play; hold 0.01% of a token to post a score on its cabinet.</p>
      <div className="mt-10">
        <ArcadeGrid />
      </div>
    </div>
  );
}
