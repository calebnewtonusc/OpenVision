"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  HAND_CONNECTIONS,
  PinchDetector,
  createScreenMap,
  type Landmark,
  type PinchResult,
} from "@/lib/openvision";

/**
 * The landing hero: a hand skeleton in the exact 21-landmark MediaPipe
 * topology, closing into a pinch, with the library's real PinchDetector
 * reading it every frame. Nothing here is a mock of the detector: the
 * ratio, the state and the thresholds on screen are the same numbers a
 * live camera would produce for this pose.
 */

type P = [number, number];

// An open right hand, palm to camera, in a 0..1 box.
const OPEN: P[] = [
  [0.5, 0.92],
  [0.38, 0.86],
  [0.29, 0.77],
  [0.23, 0.68],
  [0.18, 0.6],
  [0.4, 0.58],
  [0.37, 0.44],
  [0.355, 0.35],
  [0.345, 0.27],
  [0.5, 0.56],
  [0.5, 0.4],
  [0.5, 0.3],
  [0.5, 0.21],
  [0.59, 0.58],
  [0.61, 0.44],
  [0.62, 0.35],
  [0.63, 0.28],
  [0.67, 0.63],
  [0.71, 0.53],
  [0.735, 0.46],
  [0.755, 0.4],
];

// The same hand with thumb tip and index tip touching.
const PINCHED: P[] = OPEN.map((p, i) => {
  const moved: Record<number, P> = {
    2: [0.31, 0.76],
    3: [0.29, 0.63],
    4: [0.315, 0.52],
    6: [0.38, 0.46],
    7: [0.345, 0.46],
    8: [0.32, 0.515],
  };
  return moved[i] ?? p;
});

function pose(t: number): Landmark[] {
  return OPEN.map((o, i) => ({
    x: o[0] + (PINCHED[i][0] - o[0]) * t,
    y: o[1] + (PINCHED[i][1] - o[1]) * t,
    z: 0,
  }));
}

// One cycle: open, close, hold the pinch, open again. 3.2s, slow enough to
// read the state pill change from pinching to holding (holdMs is 220).
const CYCLE_MS = 3200;
function cycle(now: number) {
  const u = (now % CYCLE_MS) / CYCLE_MS;
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (u < 0.2) return 0;
  if (u < 0.4) return smooth((u - 0.2) / 0.2);
  if (u < 0.75) return 1;
  if (u < 0.95) return 1 - smooth((u - 0.75) / 0.2);
  return 0;
}

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const SIZE = 100;
const VIEW = createScreenMap({ width: SIZE, height: SIZE, mirror: false });
// Read the library defaults rather than restating them.
const DEFAULTS = new PinchDetector();

export function PinchFigure() {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
  const [manual, setManual] = useState<number | null>(null);
  const [frame, setFrame] = useState(() => ({
    t: 0,
    result: null as PinchResult | null,
  }));
  const detector = useRef(new PinchDetector());
  const manualRef = useRef(manual);
  useEffect(() => {
    manualRef.current = manual;
  }, [manual]);

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const t = manualRef.current ?? (reduced ? 0 : cycle(now));
      const result = detector.current.update(pose(t), now);
      setFrame({ t, result });
      if (!reduced || manualRef.current !== null) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, manual]);

  const lm = pose(frame.t).map((p) => VIEW.point(p));
  const r = frame.result;
  const pinched = r?.isPinched ?? false;
  const ratio = r?.ratio ?? 1;
  const enter = DEFAULTS.enterRatio;
  const exit = DEFAULTS.exitRatio;
  const SCALE_MAX = 1.2;
  const pct = (v: number) => `${Math.min(100, (v / SCALE_MAX) * 100)}%`;

  return (
    <figure className="w-full rounded-2xl border border-white/10 bg-zinc-900/60 p-4 backdrop-blur-xl sm:p-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="mx-auto aspect-square w-full max-w-sm"
        role="img"
        aria-label={`Hand skeleton, pinch ${pinched ? "closed" : "open"}`}
      >
        {HAND_CONNECTIONS.map(([a, b]) => (
          <line
            key={`${a}-${b}`}
            x1={lm[a].x}
            y1={lm[a].y}
            x2={lm[b].x}
            y2={lm[b].y}
            stroke="rgba(228,228,231,0.45)"
            strokeWidth={0.7}
            strokeLinecap="round"
          />
        ))}
        {lm.map((p, i) => {
          const tip = i === 4 || i === 8;
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={tip ? 1.7 : 1.1}
              fill={tip ? (pinched ? "#fde68a" : "#fafafa") : "#a1a1aa"}
            />
          );
        })}
        {r?.center && (
          <circle
            cx={VIEW.x(r.center.x)}
            cy={VIEW.y(r.center.y)}
            r={pinched ? 4.5 : 3}
            fill="none"
            stroke={pinched ? "#fde68a" : "rgba(250,250,250,0.35)"}
            strokeWidth={0.6}
            strokeDasharray={pinched ? undefined : "1.2 1.2"}
          />
        )}
      </svg>

      <figcaption className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3 font-mono text-sm">
          <span className="text-zinc-400">
            ratio <span className="text-zinc-100">{ratio.toFixed(2)}</span>
          </span>
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              pinched
                ? "border-amber-200/40 bg-amber-200/10 text-amber-100"
                : "border-white/15 text-zinc-300"
            }`}
          >
            {r?.state ?? "idle"}
          </span>
        </div>

        <div className="relative h-2 rounded-full bg-white/5" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-zinc-500/50"
            style={{ width: pct(ratio) }}
          />
          <div
            className="absolute -inset-y-1 w-px bg-amber-200"
            style={{ left: pct(enter) }}
          />
          <div
            className="absolute -inset-y-1 w-px bg-zinc-300"
            style={{ left: pct(exit) }}
          />
        </div>
        <p className="font-mono text-xs leading-relaxed text-zinc-500">
          enters below {enter.toFixed(2)}, releases above {exit.toFixed(2)}
        </p>

        <label className="block">
          <span className="sr-only">Pinch amount</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(frame.t * 100)}
            onChange={(e) => setManual(Number(e.target.value) / 100)}
            onDoubleClick={() => setManual(null)}
            className="ov-range w-full cursor-pointer"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Drag to pinch by hand
            {manual !== null && !reduced && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setManual(null)}
                  className="cursor-pointer rounded text-zinc-300 underline decoration-zinc-600 underline-offset-2 transition-colors duration-200 hover:text-amber-200"
                >
                  resume
                </button>
              </>
            )}
          </span>
        </label>
      </figcaption>
    </figure>
  );
}
