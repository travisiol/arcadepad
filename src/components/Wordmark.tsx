/** A pixel joystick, the mark of the pad. 12×12 grid. */
export function JoystickMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  const rows = [
    "....RRRR....",
    "...RRRRRR...",
    "...RRWRRR...",
    "...RRRRRR...",
    "....RRRR....",
    ".....KK.....",
    ".....KK.....",
    ".....KK.....",
    "..YYYYYYYY..",
    ".YYYYYYYYYY.",
    "YYYYYYYYYYYY",
    "KKKKKKKKKKKK",
  ];
  const colors: Record<string, string> = { R: "#ff2f4f", W: "#ffffff", K: "#2a2144", Y: "#ffe600" };
  const cells: { x: number; y: number; c: string }[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch !== "." && cells.push({ x, y, c: colors[ch] })));
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden className={className}>
      {cells.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const px = size === "lg" ? 48 : 26;
  const text = size === "lg" ? "text-[20px] sm:text-[26px]" : "text-[12px]";
  return (
    <span className="inline-flex items-center gap-3">
      <JoystickMark size={px} />
      <span className={`pixel ${text} leading-none`}>
        <span className="text-yellow">ARCADE</span> <span className="text-cyan">PAD</span>
      </span>
    </span>
  );
}
