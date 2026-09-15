import Link from "next/link";
import { PAD, PONS_FACTORY } from "@/lib/contracts";
import { explorer } from "@/lib/chain";
import { site } from "@/lib/site";
import { Wordmark } from "./Wordmark";

export function Footer() {
  return (
    <footer className="mt-24 border-t-[3px] border-line">
      <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-3">{site.description}</p>
          <p className="mt-4 text-xs text-ink-3">
            Tokens launch on Pons V2, Robinhood Chain. The pad takes 10% of collected creator fees. Nothing here is investment advice; tokens can go to zero and pots can stay empty.
          </p>
        </div>
        <div>
          <div className="label">pad</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li><Link href="/arcade" className="hover:text-yellow">the arcade</Link></li>
            <li><Link href="/launch" className="hover:text-yellow">launch a cabinet</Link></li>
            <li><Link href="/#how" className="hover:text-yellow">how it works</Link></li>
            <li><Link href="/#faq" className="hover:text-yellow">faq</Link></li>
          </ul>
        </div>
        <div>
          <div className="label">on chain</div>
          <ul className="mt-3 space-y-2 text-sm text-ink-2">
            <li>
              {PAD ? (
                <a href={explorer.address(PAD)} target="_blank" rel="noreferrer" className="mono hover:text-yellow">arcade pad · {PAD.slice(0, 6)}…{PAD.slice(-4)}</a>
              ) : (
                <span className="text-ink-3">arcade pad · awaiting deployment</span>
              )}
            </li>
            <li><a href={explorer.address(PONS_FACTORY)} target="_blank" rel="noreferrer" className="mono hover:text-yellow">pons factory · {PONS_FACTORY.slice(0, 6)}…{PONS_FACTORY.slice(-4)}</a></li>
            <li><a href={site.ponsUrl} target="_blank" rel="noreferrer" className="hover:text-yellow">pons family ↗</a></li>
            {site.x ? <li><a href={site.x} target="_blank" rel="noreferrer" className="hover:text-yellow">x ↗</a></li> : null}
          </ul>
        </div>
      </div>
    </footer>
  );
}
