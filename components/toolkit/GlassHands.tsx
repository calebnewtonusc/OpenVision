"use client";

import { useEffect, useRef } from "react";
import {
  drawGlassHand,
  rgba,
  type HandData,
  type PinchResult,
  type RGB,
} from "@/lib/openvision";

interface Props {
  hands: HandData[];
  pinches?: { left: PinchResult | null; right: PinchResult | null };
  /** Render height in px (width fills the container). Default 420. */
  height?: number;
  /** Mirror the x-axis so it feels like a mirror. Default true. */
  mirror?: boolean;
  /** Show a faint dot grid in the background. Default true. */
  showGrid?: boolean;
  /** Show a small label per hand. Default true. */
  showLabels?: boolean;
}

/**
 * Frosted-glass hand silhouettes on a dark background. For overlaying onto
 * a live video feed, render `<GlassOverlay>` (a sibling component) instead —
 * this one paints its own backdrop.
 */
export function GlassHands({
  hands,
  pinches,
  height = 420,
  mirror = true,
  showGrid = true,
  showLabels = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handsRef = useRef<HandData[]>(hands);
  const pinchesRef = useRef(pinches);

  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);
  useEffect(() => {
    pinchesRef.current = pinches;
  }, [pinches]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let t = 0;

    const render = () => {
      raf = requestAnimationFrame(render);
      t += 1;
      const W = canvas.width;
      const H = canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.scale(dpr, dpr);
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      const bgGrad = ctx.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      bgGrad.addColorStop(0, "rgba(99,102,241,0.10)");
      bgGrad.addColorStop(0.5, "rgba(10,10,15,0.85)");
      bgGrad.addColorStop(1, "rgba(5,5,8,1)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      if (showGrid) drawDotGrid(ctx, w, h);

      const mx = (x: number) => (mirror ? 1 - x : x) * w;
      const my = (y: number) => y * h;

      const liveHands = handsRef.current;
      const livePinches = pinchesRef.current;

      if (liveHands.length === 0) {
        ctx.fillStyle = "rgba(120,120,140,0.4)";
        ctx.font = "500 13px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Show your hand to the camera", w / 2, h / 2);
        return;
      }

      for (const hand of liveHands) {
        const baseHue = hand.side === "left" ? 265 : 160;
        const accent: RGB =
          hand.side === "left" ? [167, 139, 250] : [52, 211, 153];

        const sidePinch =
          hand.side === "left" ? livePinches?.left : livePinches?.right;
        const pinched = sidePinch
          ? ["pinching", "holding", "dragging"].includes(sidePinch.state)
          : false;

        drawGlassHand(ctx, hand.lm, {
          mx,
          my,
          accent,
          baseHue,
          pinched,
          pulsePhase: t * 0.05,
        });

        if (showLabels) {
          const wrist = hand.lm[0];
          const wx = mx(wrist.x);
          const wy = my(wrist.y) + 28;
          ctx.font = "600 10px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = rgba(accent, 0.9);
          ctx.fillText(hand.side.toUpperCase(), wx, wy);
        }
      }
    };

    render();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mirror, showGrid, showLabels]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height,
        display: "block",
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#050505",
      }}
    />
  );
}

function drawDotGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  const step = 26;
  for (let x = step; x < w; x += step) {
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
