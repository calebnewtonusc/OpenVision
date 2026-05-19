"use client";

import { useEffect, useRef, useState } from "react";
import type { HandData } from "@/lib/openvision";
import { classifyGesture } from "@/lib/openvision";

interface Props {
  /** Latest hands from useHandTracking onFrame. */
  hands: HandData[];
}

interface Stroke {
  points: { x: number; y: number; width: number }[];
  color: string;
}

/**
 * Index-finger paint. The pointing gesture draws. An open palm clears.
 * z-depth (distance from camera) controls stroke thickness: closer = thicker.
 */
export function DrawingCanvas({ hands }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke | null>(null);
  const wipeArmedRef = useRef(false);
  const handsRef = useRef<HandData[]>(hands);
  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);

  const [strokeCount, setStrokeCount] = useState(0);

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = null;
    setStrokeCount(0);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = (canvas.width = canvas.offsetWidth * dpr);
    const H = (canvas.height = canvas.offsetHeight * dpr);
    ctx.scale(dpr, dpr);

    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      ctx.clearRect(0, 0, W, H);

      const mx = (x: number) => (1 - x) * canvas.offsetWidth;
      const my = (y: number) => y * canvas.offsetHeight;

      for (const hand of handsRef.current) {
        const lm = hand.lm;
        const g = classifyGesture(lm);
        const indexTip = lm[8];
        const isPointing = g === "point";
        const isOpen = g === "open" || g === "almost_open";
        const color = hand.side === "left" ? "#a78bfa" : "#34d399";

        if (isOpen) {
          if (!wipeArmedRef.current) {
            wipeArmedRef.current = true;
            strokesRef.current = [];
            currentRef.current = null;
            setStrokeCount(0);
          }
        } else {
          wipeArmedRef.current = false;
        }

        if (isPointing) {
          const px = mx(indexTip.x);
          const py = my(indexTip.y);
          const depthEnergy = Math.max(0, -indexTip.z * 8 + 1);
          const width = 3 + depthEnergy * 22;

          if (!currentRef.current) {
            currentRef.current = { points: [], color };
            strokesRef.current.push(currentRef.current);
            setStrokeCount(strokesRef.current.length);
          }
          currentRef.current.points.push({ x: px, y: py, width });

          ctx.save();
          ctx.shadowBlur = 18;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, width / 2 + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          currentRef.current = null;
        }
      }

      // Render every committed stroke
      for (const stroke of strokesRef.current) {
        if (stroke.points.length < 2) continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowBlur = 10;
        ctx.shadowColor = stroke.color;
        for (let i = 1; i < stroke.points.length; i++) {
          const a = stroke.points[i - 1];
          const b = stroke.points[i];
          ctx.lineWidth = (a.width + b.width) / 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#050505",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: 360,
          display: "block",
          background:
            "radial-gradient(ellipse at center, rgba(99,102,241,0.06), transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#a1a1aa",
          background: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        Point to draw. Open palm to clear. Closer = thicker.
      </div>
      <button
        onClick={clear}
        style={{
          position: "absolute",
          right: 12,
          top: 12,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(0,0,0,0.45)",
          color: "#a1a1aa",
          fontSize: 11,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Clear ({strokeCount})
      </button>
    </div>
  );
}
