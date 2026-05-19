"use client";

import { useState } from "react";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

interface Props {
  /** The currently dwell- or gaze-focused element. Used purely for visual emphasis. */
  focused: Element | null;
}

/**
 * Air keyboard. Every key is a real button with `data-gaze-target`. Wire up
 * `useGazePinchClick` or `useDwellClick` and the keys fire their handlers.
 *
 * Doesn't manage any input internally beyond a local "typed string" buffer so
 * the user can see what they pressed.
 */
export function AirKeyboard({ focused }: Props) {
  const [typed, setTyped] = useState("");

  const append = (ch: string) => setTyped((t) => (t + ch).slice(-32));
  const backspace = () => setTyped((t) => t.slice(0, -1));
  const space = () => setTyped((t) => (t + " ").slice(-32));
  const clear = () => setTyped("");

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 16,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          minHeight: 56,
          padding: "14px 18px",
          marginBottom: 12,
          borderRadius: 10,
          background: "rgba(0,0,0,0.5)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "#fafafa",
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 18,
          letterSpacing: "0.04em",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: typed ? "#fafafa" : "#52525b" }}>
          {typed || "Look at a key, then pinch"}
        </span>
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: 22,
            background: "#a78bfa",
            animation: "blink 1s steps(1) infinite",
            marginLeft: 1,
          }}
        />
      </div>

      <style>{`@keyframes blink{0%,50%{opacity:1}50.01%,100%{opacity:0}}`}</style>

      {ROWS.map((row, ri) => (
        <div
          key={ri}
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 6,
            paddingLeft: ri === 1 ? 16 : ri === 2 ? 36 : 0,
          }}
        >
          {row.split("").map((ch) => (
            <Key
              key={ch}
              label={ch}
              onClick={() => append(ch)}
              focused={(focused as HTMLElement | null)?.dataset?.key === ch}
            />
          ))}
        </div>
      ))}

      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <Key label="space" wide={4} onClick={space} />
        <Key label="←" onClick={backspace} />
        <Key label="clear" wide={2} onClick={clear} />
      </div>
    </div>
  );
}

function Key({
  label,
  onClick,
  wide = 1,
  focused = false,
}: {
  label: string;
  onClick: () => void;
  wide?: number;
  focused?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-gaze-target="true"
      data-key={label.length === 1 ? label : undefined}
      style={{
        flex: wide,
        padding: "12px 0",
        minWidth: 32,
        borderRadius: 8,
        border: `1px solid ${focused ? "rgba(99,102,241,0.6)" : "rgba(255,255,255,0.08)"}`,
        background: focused
          ? "rgba(99,102,241,0.18)"
          : "rgba(255,255,255,0.04)",
        color: focused ? "#c4b5fd" : "#fafafa",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily:
          label.length === 1
            ? "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
            : "Inter, sans-serif",
        letterSpacing: label.length === 1 ? "0.04em" : "-0.01em",
        textTransform: label.length === 1 ? undefined : "uppercase",
        transition: "background 0.12s, border-color 0.12s",
        boxShadow: focused ? "0 0 0 2px rgba(99,102,241,0.25)" : "none",
      }}
    >
      {label}
    </button>
  );
}
