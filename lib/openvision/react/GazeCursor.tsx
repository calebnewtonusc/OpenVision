"use client";

interface Props {
  x: number;
  y: number;
  /** 0..1 dwell progress. Renders a closing ring around the cursor when > 0. */
  dwellProgress?: number;
  /** Pixel size of the cursor dot. Default 14. */
  size?: number;
  /** Tailwind/CSS color for the dot. Default indigo. */
  color?: string;
}

/**
 * Floating gaze cursor with optional dwell ring.
 *
 * Renders a fixed-position circular dot that follows the user's gaze and an
 * SVG ring that fills as dwell progresses toward a click.
 */
export function GazeCursor({
  x,
  y,
  dwellProgress = 0,
  size = 14,
  color = "rgba(99,102,241,0.95)",
}: Props) {
  const ringSize = size * 2.4;
  const ringR = ringSize / 2 - 3;
  const circ = 2 * Math.PI * ringR;
  const offset = circ * (1 - dwellProgress);

  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {dwellProgress > 0 && (
        <svg
          width={ringSize}
          height={ringSize}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%) rotate(-90deg)",
          }}
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={ringR}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 60ms linear" }}
          />
        </svg>
      )}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 ${size * 1.6}px ${color}`,
        }}
      />
    </div>
  );
}
