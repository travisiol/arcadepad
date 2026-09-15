import type { Metadata } from "next";
import Link from "next/link";
import { isAddress, type Address } from "viem";
import { PlayView } from "@/components/PlayView";

export const metadata: Metadata = { title: "Cabinet" };

export default async function PlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isAddress(token)) {
    return (
      <div className="py-16">
        <div className="panel mx-auto max-w-xl p-6">
          <p className="pixel text-[12px] uppercase text-red">not a token address</p>
          <p className="mono mt-3 break-all text-sm text-ink-3">{token}</p>
          <Link href="/arcade" className="btn btn-line btn-sm mt-4">the arcade</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="py-8 sm:py-12">
      <PlayView token={token as Address} />
    </div>
  );
}
