"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface DotPosition {
  x: string;
  y: string;
}

const POSITIONS: DotPosition[] = (() => {
  const xs = ["10%", "50%", "90%"];
  const ys = ["15%", "50%", "85%"];
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
})();

interface Props {
  active: boolean;
  clicksPerDot?: number;
  onRecord: (pageX: number, pageY: number) => void;
  onComplete: () => void;
  onCancel?: () => void;
}

/**
 * Nine-point gaze calibration overlay. Each dot must be clicked
 * `clicksPerDot` times while the user looks at it. WebGazer trains on every
 * click via the `onRecord` callback (wire this to `useGazeTracking().record`).
 *
 * Renders a full-screen modal with a 3x3 dot grid. Dots fill clockwise with a
 * progress ring; finished dots fade out. When all nine are complete,
 * `onComplete` fires.
 */
export function GazeCalibration({
  active,
  clicksPerDot = 5,
  onRecord,
  onComplete,
  onCancel,
}: Props) {
  const [counts, setCounts] = useState<number[]>(Array(9).fill(0));
  const countsRef = useRef(counts);
  countsRef.current = counts;

  useEffect(() => {
    if (active) setCounts(Array(9).fill(0));
  }, [active]);

  const handleClick = useCallback(
    (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
      const next = [...countsRef.current];
      if (next[idx] >= clicksPerDot) return;
      next[idx] = Math.min(clicksPerDot, next[idx] + 1);
      setCounts(next);
      onRecord(e.clientX, e.clientY);
      if (next.every((c) => c >= clicksPerDot)) {
        setTimeout(() => onComplete(), 400);
      }
    },
    [clicksPerDot, onRecord, onComplete],
  );

  const totalClicks = useMemo(
    () => counts.reduce((a, b) => a + b, 0),
    [counts],
  );
  const totalNeeded = clicksPerDot * 9;
  const overallProgress = totalClicks / totalNeeded;

  if (!active) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(9,9,11,0.94)",
        zIndex: 9000,
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 24,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "12px 24px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          color: "white",
          fontSize: 13,
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#a78bfa",
            boxShadow: "0 0 10px #a78bfa",
          }}
        />
        <span style={{ fontWeight: 600 }}>Calibrating gaze</span>
        <span style={{ color: "#a1a1aa" }}>
          {totalClicks} / {totalNeeded}
        </span>
        <div
          style={{
            width: 120,
            height: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,0.08)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${overallProgress * 100}%`,
              height: "100%",
              background: "linear-gradient(90deg, #6366f1, #a855f7)",
              transition: "width 200ms ease",
            }}
          />
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              padding: "4px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "transparent",
              color: "#a1a1aa",
              fontSize: 12,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Skip
          </button>
        )}
      </div>

      <p
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -200px)",
          color: "#71717a",
          fontSize: 14,
          fontFamily: "Inter, sans-serif",
          maxWidth: 320,
          textAlign: "center",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Look directly at each dot and click it {clicksPerDot} times. The model
        learns from where your eyes are when you click.
      </p>

      {POSITIONS.map((pos, idx) => {
        const c = counts[idx];
        const done = c >= clicksPerDot;
        const progress = c / clicksPerDot;
        return (
          <button
            key={idx}
            onClick={(e) => handleClick(idx, e)}
            disabled={done}
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)",
              width: 56,
              height: 56,
              padding: 0,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              cursor: done ? "default" : "pointer",
              opacity: done ? 0.18 : 1,
              transition: "opacity 0.4s ease",
            }}
            aria-label={`Calibration dot ${idx + 1}, ${c} of ${clicksPerDot} clicks`}
          >
            <svg
              width={56}
              height={56}
              viewBox="0 0 56 56"
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                cx={28}
                cy={28}
                r={24}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={3}
              />
              <circle
                cx={28}
                cy={28}
                r={24}
                fill="none"
                stroke="#a78bfa"
                strokeWidth={3}
                strokeDasharray={2 * Math.PI * 24}
                strokeDashoffset={2 * Math.PI * 24 * (1 - progress)}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 150ms ease" }}
              />
            </svg>
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: done ? "#10b981" : "#a78bfa",
                boxShadow: done
                  ? "0 0 14px #10b981"
                  : "0 0 14px rgba(167,139,250,0.7)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
