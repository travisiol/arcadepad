"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "./ConnectButton";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { href: "/arcade", label: "arcade" },
  { href: "/launch", label: "launch" },
  { href: "/#how", label: "how it works" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b-[3px] border-line bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Arcade Pad home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-6 sm:flex" aria-label="Main">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link key={l.href} href={l.href} className={`pixel text-[10px] uppercase ${active ? "text-yellow" : "text-ink-2 hover:text-yellow"}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/launch" className="btn btn-magenta btn-sm hidden sm:inline-flex">
            insert coin
          </Link>
          <ConnectButton />
        </div>
      </div>
      <nav className="flex items-center justify-center gap-5 border-t-[3px] border-line py-2 sm:hidden" aria-label="Main, mobile">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={`pixel text-[9px] uppercase ${path === l.href ? "text-yellow" : "text-ink-2"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
