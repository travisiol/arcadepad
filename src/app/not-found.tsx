import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="pixel text-[26px] text-magenta">404</p>
      <p className="pixel mt-4 text-[11px] uppercase text-ink-3">game over · no such screen</p>
      <Link href="/" className="btn btn-yellow mt-8">
        insert coin
      </Link>
    </div>
  );
}
