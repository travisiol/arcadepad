import Link from "next/link";
import { Hero } from "@/components/landing/Hero";
import { Latest } from "@/components/landing/Latest";
import { Roster } from "@/components/landing/Roster";
import { Stats } from "@/components/landing/Stats";
import { LAUNCH_FEE_ETH_DISPLAY } from "@/lib/contracts";

const STEPS = [
  {
    n: "01",
    title: "launch",
    color: "text-yellow",
    body: `Name, ticker, logo, and the game your token ships with. One transaction on Pons V2: the token, its bonding curve and its cabinet, for ${LAUNCH_FEE_ETH_DISPLAY} ETH plus whatever you buy first. Pick the pot share (10–90% of your creator fees) and the round length (1–30 days).`,
  },
  {
    n: "02",
    title: "trade",
    color: "text-cyan",
    body: "Every buy and sell on the curve pays a fee; Pons hands the creator's share to the cabinet's vault instead of the creator's wallet. Anyone can press collect: 10% to the pad, the pot share to the pot, the rest to the creator. Nobody can point the fees elsewhere — the vault has no owner.",
  },
  {
    n: "03",
    title: "play",
    color: "text-green",
    body: "The cabinet is free to play. To post a score you hold 0.01% of the supply and finish a run; the referee replays it tick for tick and signs the score. When the round's bell rings, the high score takes the whole pot. No score, the pot rolls over.",
  },
];

const FAQ = [
  {
    q: "Can a bot play?",
    a: "Yes. The referee proves a run happened under the rules — same seed, same inputs, same score — not who held the joystick. A cabinet's pot goes to whoever plays best, human or script, and every rule says so out loud. If you launch, you know that going in.",
  },
  {
    q: "Why do I need to hold the token to post a score?",
    a: "It ties the game to the coin: 0.01% of the launch supply (100,000 of 1,000,000,000) is a few dollars early on and the only ticket there is. Playing needs nothing. Posting a score needs the ticket.",
  },
  {
    q: "Where does the pot come from, exactly?",
    a: "From trading fees, nowhere else. Pons takes a 1% fee on every curve trade and pays the creator's part (70% of it) to the creator-fee recipient — here, the cabinet's vault. Fees accrue on the curve and Pons sweeps them to its escrow in batches; collect() pulls what is swept. Nobody deposits into a pot by hand, and the pad never touches your trade.",
  },
  {
    q: "What if nobody posts a score?",
    a: "The pot stays and rolls into the next round. It never goes to the creator or the pad.",
  },
  {
    q: "What if the referee is down?",
    a: "You can still play — the cabinet runs in your browser. You just can't get a score signed until it is back, and a signed score is only valid for 15 minutes and for the current round.",
  },
  {
    q: "What does the pad take?",
    a: "10% of every collected creator fee, forever, and nothing else: launching costs Pons' fee, trading costs Pons' fee, playing costs nothing.",
  },
  {
    q: "What happens when the token graduates?",
    a: "The curve closes and the market moves to the pool. Fees swept before graduation still land in the vault and can still be collected; the cabinet keeps running its rounds on whatever is in its pot.",
  },
];

export default function Home() {
  return (
    <>
      <Hero />
      <Stats />
      <Roster />

      <section id="how" className="py-12 sm:py-16">
        <p className="label">how it works</p>
        <h2 className="pixel mt-3 text-[18px] leading-relaxed sm:text-[22px]">Three steps. One machine.</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="panel p-5">
              <div className="flex items-baseline justify-between">
                <span className={`pixel text-[22px] ${s.color}`}>{s.n}</span>
                <span className={`pixel text-[11px] uppercase ${s.color}`}>{s.title}</span>
              </div>
              <p className="mt-4 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="panel mt-8 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="pixel text-[12px] uppercase text-ink">where a collected fee goes</h3>
            <span className="text-[12px] text-ink-3">example: pot share set to 50%</span>
          </div>
          <div className="mt-5 flex h-10 w-full overflow-hidden border-[3px] border-black" role="img" aria-label="10% pad, 50% pot, 40% creator">
            <div className="flex items-center justify-center bg-yellow pixel text-[9px] text-black" style={{ width: "10%" }}>10%</div>
            <div className="flex items-center justify-center bg-magenta pixel text-[9px] text-black" style={{ width: "50%" }}>50% pot</div>
            <div className="flex items-center justify-center bg-cyan pixel text-[9px] text-black" style={{ width: "40%" }}>40% creator</div>
          </div>
          <ul className="mt-4 grid gap-3 text-[13px] text-ink-2 sm:grid-cols-3">
            <li><span className="text-yellow">pad</span> — fixed 10%, the pad&apos;s only revenue.</li>
            <li><span className="text-magenta">pot</span> — 10–90%, chosen at launch and frozen. Paid to the round&apos;s high score.</li>
            <li><span className="text-cyan">creator</span> — the rest, withdrawable any time.</li>
          </ul>
        </div>
      </section>

      <Latest />

      <section id="faq" className="py-12 sm:py-16">
        <p className="label">faq</p>
        <h2 className="pixel mt-3 text-[18px] leading-relaxed sm:text-[22px]">Straight answers</h2>
        <dl className="mt-8 grid gap-4 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q} className="panel-inset p-5">
              <dt className="pixel text-[11px] leading-relaxed text-yellow">{f.q}</dt>
              <dd className="mt-3 text-[14px] leading-relaxed text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link href="/launch" className="btn btn-magenta">
            insert coin · launch
          </Link>
          <span className="text-sm text-ink-3">Tokens launch on Pons V2, Robinhood Chain (chain id 4663).</span>
        </div>
      </section>
    </>
  );
}
