"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { localSeed, Runner, type FinishedRun, type RunnerMode } from "@/game/runner";
import { DOWN, FIRE, LEFT, RIGHT, UP, type BaseState, type GameDef, type Skin } from "@/game/types";

export interface CabinetProps {
  game: GameDef<BaseState>;
  skin: Skin;
  mode: RunnerMode;
  /** The run's seed; a new value (or runKey) starts a fresh run. */
  seed?: number;
  runKey?: string | number;
  /** Shown over the screen in attract mode; clicking it calls onStart. */
  onStart?: () => void;
  onOver?: (run: FinishedRun) => void;
  onScore?: (score: number) => void;
  /** "screen" = bezel only (cards); "cabinet" = the whole machine. */
  variant?: "screen" | "cabinet";
  /** Keeps attract runs short so cards keep changing. */
  attractSeconds?: number;
  /** On-screen buttons (phones). Default: only when the pointer is coarse. */
  touch?: boolean | "auto";
  className?: string;
  marquee?: string;
  paused?: boolean;
}

const BITS = { left: LEFT, right: RIGHT, up: UP, down: DOWN, fire: FIRE } as const;

const COARSE = "(pointer: coarse)";
function subscribeCoarse(fn: () => void) {
  const mq = window.matchMedia(COARSE);
  mq.addEventListener("change", fn);
  return () => mq.removeEventListener("change", fn);
}
/** True on touch devices (phones): show the on-screen buttons. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, () => window.matchMedia(COARSE).matches, () => false);
}

export function Cabinet({
  game,
  skin,
  mode,
  seed,
  runKey,
  onStart,
  onOver,
  onScore,
  variant = "screen",
  attractSeconds = 60,
  touch = "auto",
  className = "",
  marquee,
  paused = false,
}: CabinetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const runnerRef = useRef<Runner | null>(null);
  const [scale, setScale] = useState(2);
  const coarse = useCoarsePointer();
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);
  const skinRef = useRef(skin);
  const onOverRef = useRef(onOver);
  const onScoreRef = useRef(onScore);
  const lastScoreRef = useRef(0);
  useEffect(() => {
    skinRef.current = skin;
    onOverRef.current = onOver;
    onScoreRef.current = onScore;
  });

  // Integer scale from the container width: big, even pixels.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const w = box.getBoundingClientRect().width;
      if (w <= 0) return;
      // Whole multiples keep every pixel the same size; below 2× (cards,
      // phones) the screen fills its box instead of shrinking to 1×.
      const whole = Math.floor(w / game.W);
      setScale(whole >= 2 ? whole : Math.max(1, Math.floor((w / game.W) * 100) / 100));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [game.W]);


  // A runner per (game, mode, seed, runKey).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const runner = new Runner(game, canvas, {
      mode,
      seed: seed ?? localSeed(),
      skin: skinRef.current,
      onTick: (s) => {
        if (s.score !== lastScoreRef.current) {
          lastScoreRef.current = s.score;
          setScore(s.score);
          onScoreRef.current?.(s.score);
        }
      },
      onOver: (run) => {
        setOver(true);
        onOverRef.current?.(run);
      },
    });
    runner.attractLimit = attractSeconds * 60;
    runnerRef.current = runner;
    lastScoreRef.current = 0;
    setScore(0);
    setOver(false);
    if (!paused) runner.start();
    // Rehearsal hook: lets a script drive the last-mounted cabinet tick by
    // tick when the browser pane is hidden and animation frames stop.
    if (process.env.NODE_ENV !== "production") (window as unknown as { __arcadepadRunner?: Runner }).__arcadepadRunner = runner;
    return () => {
      runner.stop();
      runnerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, mode, seed, runKey]);

  // The skin can arrive after the runner (logo loads async): swap it in place.
  useEffect(() => {
    const r = runnerRef.current;
    if (r) r.opts.skin = skin;
  }, [skin]);

  useEffect(() => {
    const r = runnerRef.current;
    if (!r) return;
    if (paused) r.stop();
    else r.start();
  }, [paused]);

  // Attract mode: restart on a fresh seed once the demo ends.
  useEffect(() => {
    if (mode !== "attract" || !over) return;
    const id = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      runnerRef.current?.stop();
      const runner = new Runner(game, canvas, {
        mode: "attract",
        seed: localSeed(),
        skin: skinRef.current,
        onTick: (s) => {
          if (s.score !== lastScoreRef.current) {
            lastScoreRef.current = s.score;
            setScore(s.score);
          }
        },
        onOver: () => setOver(true),
      });
      runner.attractLimit = attractSeconds * 60;
      runnerRef.current = runner;
      lastScoreRef.current = 0;
      setScore(0);
      setOver(false);
      if (!paused) runner.start();
    }, 2200);
    return () => clearTimeout(id);
  }, [over, mode, game, attractSeconds, paused]);

  // Keyboard, only while playing.
  useEffect(() => {
    if (mode !== "play") return;
    const down = (e: KeyboardEvent) => {
      const bit = Runner.keyBit(e);
      if (!bit) return;
      e.preventDefault();
      runnerRef.current?.press(bit);
    };
    const up = (e: KeyboardEvent) => {
      const bit = Runner.keyBit(e);
      if (!bit) return;
      e.preventDefault();
      runnerRef.current?.release(bit);
    };
    const blur = () => runnerRef.current?.setInput(0);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode]);

  const press = useCallback((bit: number) => () => runnerRef.current?.press(bit), []);
  const release = useCallback((bit: number) => () => runnerRef.current?.release(bit), []);

  const showTouch = touch === true || (touch === "auto" && coarse && mode === "play");
  const accent = skin.accent;

  const screen = (
    <div ref={boxRef} className="relative w-full">
      <div className="relative mx-auto" style={{ width: game.W * scale, height: game.H * scale }}>
        <canvas ref={canvasRef} width={game.W} height={game.H} className="block" style={{ width: game.W * scale, height: game.H * scale }} aria-label={`${game.name} screen`} />
        {/* Screen glass: vignette + scanlines. */}
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 40px rgba(0,0,0,0.55)", background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.12) 0 1px, transparent 1px 3px)" }} />
        {mode === "attract" && onStart ? (
          <button
            type="button"
            onClick={onStart}
            className="absolute inset-0 flex items-end justify-center pb-[10%] focus-visible:outline-none"
            aria-label={`Play ${game.name}`}
          >
            <span className="pixel blink border-[3px] border-black bg-black/80 px-3 py-2 text-[10px] uppercase" style={{ color: accent }}>
              press start
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );

  const touchPad = showTouch ? (
    <div className="mt-3 grid select-none grid-cols-[auto_1fr_auto] items-center gap-3" aria-label="Touch controls">
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        <span />
        <PadButton label="▲" onDown={press(BITS.up)} onUp={release(BITS.up)} />
        <span />
        <PadButton label="◀" onDown={press(BITS.left)} onUp={release(BITS.left)} />
        <span className="h-11 w-11 border-[3px] border-line bg-panel-2" />
        <PadButton label="▶" onDown={press(BITS.right)} onUp={release(BITS.right)} />
        <span />
        <PadButton label="▼" onDown={press(BITS.down)} onUp={release(BITS.down)} />
        <span />
      </div>
      <div />
      <PadButton label="FIRE" wide accent={accent} onDown={press(BITS.fire)} onUp={release(BITS.fire)} />
    </div>
  ) : null;

  if (variant === "screen") {
    return (
      <div className={`panel-inset p-2 ${className}`}>
        {screen}
        {touchPad}
      </div>
    );
  }

  return (
    <div className={`select-none ${className}`}>
      {/* Marquee */}
      <div className="panel relative overflow-hidden px-4 py-3 text-center" style={{ borderColor: accent }}>
        <div className="marquee-lights absolute inset-x-0 top-0 h-[7px] opacity-90" />
        <div className="marquee-lights absolute inset-x-0 bottom-0 h-[7px] opacity-90" />
        <div className="pixel truncate text-[12px] uppercase sm:text-[14px]" style={{ color: accent, textShadow: `0 0 10px ${accent}` }}>
          {marquee ?? `${skin.symbol} · ${game.name}`}
        </div>
      </div>
      {/* Bezel */}
      <div className="panel mt-[-3px] bg-panel-2 p-3 sm:p-4">
        <div className="panel-inset p-2 sm:p-3">{screen}</div>
        <div className="mt-3 flex items-center justify-between">
          <span className="label">score</span>
          <span className="led text-[14px]">{String(score).padStart(6, "0")}</span>
        </div>
      </div>
      {/* Control panel */}
      <div className="panel mt-[-3px] flex items-center justify-between gap-4 px-4 py-4" style={{ background: "linear-gradient(#1a1233, #120c24)" }}>
        <div className="flex items-center gap-4">
          <span className="relative block h-10 w-10 border-[3px] border-black bg-black" aria-hidden>
            <span className="absolute left-1/2 top-[-18px] h-6 w-[6px] -translate-x-1/2 bg-line-2" />
            <span className="absolute left-1/2 top-[-30px] h-5 w-5 -translate-x-1/2 border-[3px] border-black bg-red" />
          </span>
          <span className="label hidden sm:inline">{game.controls}</span>
        </div>
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-9 w-9 border-[3px] border-black" style={{ background: accent, boxShadow: "3px 3px 0 #000" }} />
          <span className="h-9 w-9 border-[3px] border-black bg-yellow" style={{ boxShadow: "3px 3px 0 #000" }} />
        </div>
      </div>
      {touchPad ? <div className="panel mt-[-3px] px-4 py-3">{touchPad}</div> : null}
      {/* Coin door */}
      <div className="panel mt-[-3px] flex items-center justify-between px-4 py-3">
        <span className="stripe h-3 w-24" aria-hidden />
        <span className="pixel text-[9px] uppercase text-ink-3">free play · 1 credit</span>
        <span className="h-4 w-8 border-[3px] border-black bg-black" aria-hidden />
      </div>
    </div>
  );
}

function PadButton({ label, onDown, onUp, wide = false, accent }: { label: string; onDown: () => void; onUp: () => void; wide?: boolean; accent?: string }) {
  return (
    <button
      type="button"
      className={`pixel flex items-center justify-center border-[3px] border-black text-[11px] text-black active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${wide ? "h-16 w-24" : "h-11 w-11"}`}
      style={{ background: accent ?? "#c9c3e6", boxShadow: "3px 3px 0 #000", touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerLeave={onUp}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
    >
      {label}
    </button>
  );
}
