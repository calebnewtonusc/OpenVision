"use client";

import { useEffect, useRef, useState } from "react";
import {
  PinchDetector,
  type PinchResult,
  type HandData,
} from "@/lib/openvision";

const STATES = ["idle", "pinching", "holding", "dragging", "released"] as const;
type State = (typeof STATES)[number];

const STATE_COLORS: Record<State, string> = {
  idle: "#52525b",
  pinching: "#6366f1",
  holding: "#a855f7",
  dragging: "#fbbf24",
  released: "#10b981",
};

interface Props {
  hands: HandData[];
}

/**
 * Live-tunable PinchDetector. Drag the sliders to retune the gesture in real
 * time. The state pill, ratio bar, and threshold lines all update on every
 * frame.
 */
export function TunablePinch({ hands }: Props) {
  const [enterRatio, setEnterRatio] = useState(0.38);
  const [exitRatio, setExitRatio] = useState(0.52);
  const [holdMs, setHoldMs] = useState(220);

  const detectorRef = useRef(new PinchDetector());
  const [result, setResult] = useState<PinchResult | null>(null);

  useEffect(() => {
    detectorRef.current.enterRatio = enterRatio;
    detectorRef.current.exitRatio = exitRatio;
    detectorRef.current.holdMs = holdMs;
  }, [enterRatio, exitRatio, holdMs]);

  useEffect(() => {
    const right = hands.find((h) => h.side === "right") ?? hands[0];
    if (!right) {
      detectorRef.current.update(null);
      setResult(null);
      return;
    }
    setResult(detectorRef.current.update(right.lm));
  }, [hands]);

  const ratio = result?.ratio ?? 1;
  const state = (result?.state ?? "idle") as State;
  const heldMs = result?.heldMs ?? 0;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STATES.map((s) => (
          <span
            key={s}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              background:
                s === state
                  ? `${STATE_COLORS[s]}25`
                  : "rgba(255,255,255,0.025)",
              color: s === state ? STATE_COLORS[s] : "#52525b",
              border: `1px solid ${s === state ? `${STATE_COLORS[s]}55` : "rgba(255,255,255,0.06)"}`,
              textTransform: "uppercase",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            {s}
          </span>
        ))}
      </div>

      <div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#71717a",
            marginBottom: 6,
          }}
        >
          Pinch ratio · {ratio.toFixed(3)}
        </div>
        <div
          style={{
            position: "relative",
            height: 12,
            borderRadius: 999,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "visible",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              borderRadius: 999,
              width: `${Math.min(1, ratio) * 100}%`,
              background: STATE_COLORS[state],
              transition: "width 80ms linear, background 120ms",
            }}
          />
          <ThresholdMarker pos={enterRatio} label="enter" color="#6366f1" />
          <ThresholdMarker pos={exitRatio} label="exit" color="#a855f7" />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <Slider
          label="enterRatio"
          min={0.1}
          max={0.6}
          step={0.01}
          value={enterRatio}
          onChange={setEnterRatio}
          hint="Pinch starts when ratio drops below this."
        />
        <Slider
          label="exitRatio"
          min={0.2}
          max={0.8}
          step={0.01}
          value={exitRatio}
          onChange={setExitRatio}
          hint="Pinch ends when ratio rises above this. Higher than enter = hysteresis."
        />
        <Slider
          label="holdMs"
          min={80}
          max={600}
          step={20}
          value={holdMs}
          onChange={setHoldMs}
          hint={`How long until state becomes "holding". Currently held ${Math.round(heldMs)}ms.`}
        />
      </div>
    </div>
  );
}

function ThresholdMarker({
  pos,
  label,
  color,
}: {
  pos: number;
  label: string;
  color: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${Math.min(1, pos) * 100}%`,
        top: -4,
        bottom: -4,
        width: 1,
        background: color,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: -16,
          transform: "translateX(-50%)",
          padding: "1px 6px",
          borderRadius: 999,
          background: `${color}22`,
          border: `1px solid ${color}55`,
          color,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Slider({
  label,
  hint,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 12,
        color: "#a1a1aa",
      }}
    >
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span
          style={{
            color: "#fafafa",
            fontFamily:
              "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily:
              "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
            color: "#818cf8",
            fontWeight: 600,
          }}
        >
          {value}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          accentColor: "#a855f7",
        }}
      />
      <span style={{ fontSize: 11, color: "#52525b" }}>{hint}</span>
    </label>
  );
}
