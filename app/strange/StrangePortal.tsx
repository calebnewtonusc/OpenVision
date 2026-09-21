"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking, type HandFrame } from "@/lib/openvision/react/useHandTracking";
import { CircleGestureDetector, type CircleProgress } from "@/lib/openvision/core/circle";
import { FINGER_TIPS } from "@/lib/openvision/core/skeleton";
import {
  initialPortalState,
  stepPortal,
  ignitionAmount,
  collapseAmount,
  type PortalPhase,
} from "@/lib/openvision/core/portal-state";

/**
 * Pinch, draw a circle in the air, get a Doctor Strange portal. Pinch again
 * to collapse it.
 *
 * THE VISUAL RULES came from 24 frames of two reference clips, not from
 * memory, and four of them contradict what "an orange glowing ring" makes you
 * reach for by default:
 *
 *  1. Sparks are LONG THIN STREAKS, not dots. Every particle is a line drawn
 *     along its own velocity. This is the biggest single difference between
 *     this and the indigo portal in HandsWeb, which draws arcs.
 *  2. They leave tangentially and curve outward, a catherine wheel, not a
 *     radial burst. One angular drag term produces the whole look.
 *  3. Additive blending. `globalCompositeOperation = "lighter"` is what makes
 *     overlapping sparks bloom to white instead of muddying. Fire on canvas
 *     is mostly this one line.
 *  4. The interior is NOT transparent and NOT a scene. It is a dark disc,
 *     near black at the centre, warm amber where it meets the rim.
 *
 * ALL STATE LIVES IN A PURE REDUCER, in core/portal-state.ts, with tests.
 * It used to live here as three refs mutated in eight places inside the
 * animation loop, and that shipped two bugs in twenty minutes: the portal
 * opened for a single frame, and then it could not be reopened after closing.
 * Neither was visible by reading and neither was reachable by a test. What is
 * left in this file is drawing.
 */

// Sampled off the reference frames rather than picked.
const CORE = "255, 236, 189"; // white-gold rim core
const SPARK_HOT = "255, 196, 94";
const SPARK_MID = "255, 141, 44";
const SPARK_COLD = "214, 74, 16";

const IGNITE_MS = 520;
const CLOSE_MS = 380;
const MIN_OPEN_MS = 600;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function portalLabel(p: PortalPhase) {
  if (p === "open") return "pinch to close";
  if (p === "igniting") return "opening";
  if (p === "closing") return "closing";
  if (p === "drawing") return "keep going";
  return "pinch, then circle";
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  heat: number;
  width: number;
}

const IDLE_PROGRESS: CircleProgress = {
  progress: 0,
  sweep: 0,
  center: null,
  radius: 0,
  completed: false,
  direction: null,
};

export default function StrangePortal() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const detector = useRef(new CircleGestureDetector());
  const state = useRef(initialPortalState());
  const sparks = useRef<Spark[]>([]);
  const comet = useRef<{ x: number; y: number }[]>([]);
  const ghost = useRef<{ x: number; y: number }[]>([]);
  const spin = useRef(0);
  const frame = useRef<HandFrame | null>(null);
  const forceClose = useRef(false);

  const [hud, setHud] = useState({ progress: 0, phase: "idle" as PortalPhase });

  const onFrame = useCallback((f: HandFrame) => {
    frame.current = f;
  }, []);

  const { start, started, loading, fps } = useHandTracking({
    videoRef,
    onFrame,
    options: { maxNumHands: 1, modelComplexity: 1 },
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnAt = (
      x: number,
      y: number,
      tangentX: number,
      tangentY: number,
      count: number,
      speed: number,
    ) => {
      for (let i = 0; i < count; i++) {
        // Tangential base velocity, plus a smaller outward push and jitter.
        // The ratio between those is what makes a catherine wheel rather than
        // either a ring of sitting embers or a starburst.
        const spread = (Math.random() - 0.5) * 0.9;
        const sp = speed * (0.4 + Math.random() * 1.1);
        sparks.current.push({
          x,
          y,
          vx: (tangentX + spread * -tangentY) * sp,
          vy: (tangentY + spread * tangentX) * sp,
          life: 1,
          decay: 0.012 + Math.random() * 0.03,
          heat: Math.random(),
          width: 0.6 + Math.random() * 1.6,
        });
      }
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const W = window.innerWidth;
      const H = window.innerHeight;

      // Slight persistence rather than a hard clear: this is the motion blur
      // that turns discrete frames into streaks the eye reads as sparks.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(4, 3, 2, 0.30)";
      ctx.fillRect(0, 0, W, H);

      const f = frame.current;
      const lm = f?.hands?.[0]?.lm ?? null;
      const mx = (nx: number) => (1 - nx) * W;
      const my = (ny: number) => ny * H;

      // THE PINCH IS BOTH THE GATE AND THE PEN. `PinchResult.center` is
      // already the midpoint between thumb tip and index tip, so the tracked
      // point is the spot between his pinched fingers. Gating on it removes
      // every accidental fire: a wave, a reach for the keyboard, a scratched
      // nose. An open hand moving in a circle does nothing at all.
      const pinch = f?.pinches?.right?.isPinched
        ? f.pinches.right
        : f?.pinches?.left?.isPinched
          ? f.pinches.left
          : null;

      let p: CircleProgress;
      if (pinch?.center) {
        p = detector.current.push(pinch.center.x, pinch.center.y, now);
      } else {
        // Releasing abandons the circle. Half drawn, let go, the other half a
        // second later is not one gesture and must not be treated as one.
        detector.current.reset();
        p = IDLE_PROGRESS;
      }

      const prevPhase = state.current.phase;
      state.current = stepPortal(
        state.current,
        {
          now,
          pinched: !!pinch,
          completed: p.completed && !!p.center,
          progress: p.progress,
          center: p.center ? { x: mx(p.center.x), y: my(p.center.y) } : null,
          // Normalized coords mix the two axes, so sqrt(W*H) is the isotropic
          // conversion back to pixels. The portal is the size of the circle
          // he actually drew.
          radius: p.radius * Math.sqrt(W * H),
        },
        { igniteMs: IGNITE_MS, closeMs: CLOSE_MS, minOpenMs: MIN_OPEN_MS },
      );

      // The close button routes through the same collapse the pinch uses, so
      // the button and the gesture are not two different features.
      if (forceClose.current) {
        forceClose.current = false;
        if (state.current.phase === "open" || state.current.phase === "igniting") {
          state.current = { ...state.current, phase: "closing", closeAt: now, armed: false };
        }
      }

      const S = state.current;
      const portalUp =
        S.phase === "igniting" || S.phase === "open" || S.phase === "closing";

      if (S.phase === "igniting" && prevPhase !== "igniting") {
        ghost.current = comet.current.slice();
        comet.current = [];
        for (let i = 0; i < 260; i++) {
          const a = Math.random() * Math.PI * 2;
          spawnAt(
            S.x + Math.cos(a) * S.r,
            S.y + Math.sin(a) * S.r,
            -Math.sin(a),
            Math.cos(a),
            1,
            5.5,
          );
        }
      }
      if (!portalUp && prevPhase === "closing") {
        detector.current.reset();
        comet.current = [];
        ghost.current = [];
      }
      if (!pinch && !portalUp) comet.current = [];

      // ── Fingertips, so the hand is visible before anything is drawn ───────
      if (lm && !portalUp) {
        ctx.globalCompositeOperation = "lighter";
        for (const t of FINGER_TIPS) {
          ctx.fillStyle = `rgba(${SPARK_MID}, ${pinch ? 0.55 : 0.2})`;
          ctx.beginPath();
          ctx.arc(mx(lm[t].x), my(lm[t].y), pinch ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── The comet: the pinch point while the circle is being drawn ────────
      if (pinch?.center && !portalUp) {
        const tx = mx(pinch.center.x);
        const ty = my(pinch.center.y);
        const prev = comet.current[comet.current.length - 1];
        comet.current.push({ x: tx, y: ty });
        if (comet.current.length > 46) comet.current.shift();

        if (prev && p.progress > 0.02) {
          let dx = tx - prev.x;
          let dy = ty - prev.y;
          const mag = Math.hypot(dx, dy) || 1;
          dx /= mag;
          dy /= mag;
          // More sparks the faster the hand moves, which is what makes a
          // confident sweep look better than a timid one.
          spawnAt(tx, ty, dx, dy, Math.min(26, 4 + Math.floor(mag * 0.9)), 2.6);
        }
      }

      if (S.phase === "drawing" && comet.current.length > 2) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 1; i < comet.current.length; i++) {
          const a = comet.current[i - 1];
          const b = comet.current[i];
          const k = i / comet.current.length;
          ctx.strokeStyle = `rgba(${SPARK_MID}, ${k * 0.5})`;
          ctx.lineWidth = 1 + k * 3;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // ── The portal ────────────────────────────────────────────────────────
      if (portalUp) {
        spin.current += 0.012;
        const ignite = ignitionAmount(S, now, IGNITE_MS);
        const shut = collapseAmount(S, now, CLOSE_MS);
        const e = ease(ignite);
        // Snap out from slightly inside the drawn circle, then collapse to a
        // point. Not a grow-from-zero: he drew it at this size.
        const rad = S.r * (0.86 + 0.14 * e) * (1 - ease(shut));
        const vis = e * (1 - shut);
        const age = (now - S.born) / 1000;

        if (rad >= 2) {
          // Dark amber interior. Rule 4: a disc, not a hole. It fades in
          // across the ignition, which is the hole opening.
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = vis;
          const inner = ctx.createRadialGradient(S.x, S.y, 0, S.x, S.y, rad);
          inner.addColorStop(0, "rgba(8, 5, 3, 1)");
          inner.addColorStop(0.72, "rgba(26, 12, 5, 1)");
          inner.addColorStop(0.94, "rgba(92, 40, 12, 0.95)");
          inner.addColorStop(1, `rgba(${SPARK_COLD}, 0.65)`);
          ctx.fillStyle = inner;
          ctx.beginPath();
          ctx.arc(S.x, S.y, rad, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.globalCompositeOperation = "lighter";

          const bloom = ctx.createRadialGradient(S.x, S.y, rad * 0.85, S.x, S.y, rad * 1.7);
          bloom.addColorStop(0, `rgba(${SPARK_MID}, ${0.3 * vis})`);
          bloom.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = bloom;
          ctx.beginPath();
          ctx.arc(S.x, S.y, rad * 1.7, 0, Math.PI * 2);
          ctx.fill();

          // The drawn arc fading out as the rim takes over. Without this the
          // trail is deleted on the frame the ring appears, which is a cut.
          if (ignite < 1 && ghost.current.length > 2) {
            const a = 1 - e;
            for (let i = 1; i < ghost.current.length; i++) {
              const g0 = ghost.current[i - 1];
              const g1 = ghost.current[i];
              ctx.strokeStyle = `rgba(${SPARK_HOT}, ${a * 0.55})`;
              ctx.lineWidth = 2 + a * 3;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(g0.x, g0.y);
              ctx.lineTo(g1.x, g1.y);
              ctx.stroke();
            }
          } else if (ghost.current.length) {
            ghost.current = [];
          }

          // The shockwave: a bright ring expanding past the portal, during
          // ignition only. This carries the eye from the drawn arc to the
          // finished hole instead of cutting between them.
          if (ignite < 1) {
            ctx.strokeStyle = `rgba(${CORE}, ${(1 - e) * 0.55})`;
            ctx.lineWidth = (1 - e) * 9 + 1;
            ctx.beginPath();
            ctx.arc(S.x, S.y, rad * (1 + e * 0.85), 0, Math.PI * 2);
            ctx.stroke();
          }

          // The rim. Thin, white-gold core, flickering. Brighter and thicker
          // during ignition and collapse.
          const flicker = 0.82 + Math.sin(now / 55) * 0.1 + Math.random() * 0.08;
          const heat = 1 + (1 - e) * 2.2 + ease(shut) * 2.6;
          ctx.shadowBlur = 42 * heat;
          ctx.shadowColor = `rgba(${SPARK_MID}, 1)`;
          ctx.strokeStyle = `rgba(${CORE}, ${Math.min(1, flicker * (0.35 + vis))})`;
          ctx.lineWidth = Math.max(1.6, rad * 0.028) * heat;
          ctx.beginPath();
          ctx.arc(S.x, S.y, rad, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Sparks off the rim. Heaviest during ignition. During the collapse
          // they are thrown inward, so it looks sucked shut rather than
          // simply scaled down.
          const emit =
            S.phase === "igniting" ? 30 : S.phase === "closing" ? 22 : age < 0.6 ? 16 : 7;
          const inward = S.phase === "closing" ? -1 : 1;
          for (let i = 0; i < emit; i++) {
            const a = Math.random() * Math.PI * 2 + spin.current;
            spawnAt(
              S.x + Math.cos(a) * rad,
              S.y + Math.sin(a) * rad,
              -Math.sin(a) * inward,
              Math.cos(a) * inward,
              1,
              S.phase === "igniting" ? 5.0 : 3.4,
            );
          }
        }
      }

      // ── Sparks. Rules 1 and 2 live here. ──────────────────────────────────
      ctx.globalCompositeOperation = "lighter";
      const alive: Spark[] = [];
      for (const sp of sparks.current) {
        // Angular drag: rotate the velocity a little every frame. This one
        // term is the curve. Without it the sparks fly straight and the whole
        // thing reads as a firework instead of a portal.
        const c = Math.cos(0.035);
        const sn = Math.sin(0.035);
        const nvx = sp.vx * c - sp.vy * sn;
        const nvy = sp.vx * sn + sp.vy * c;
        sp.vx = nvx * 0.975;
        sp.vy = nvy * 0.975 + 0.055; // gravity: embers fall and settle

        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.life -= sp.decay;
        if (sp.life <= 0) continue;
        alive.push(sp);

        // Drawn as a LINE along velocity, length scaled by speed. Rule 1.
        const speed = Math.hypot(sp.vx, sp.vy) || 1;
        const len = Math.min(26, 2 + speed * 3.1);
        const h = sp.heat * sp.life;
        const col = h > 0.62 ? CORE : h > 0.3 ? SPARK_HOT : h > 0.14 ? SPARK_MID : SPARK_COLD;

        ctx.strokeStyle = `rgba(${col}, ${Math.min(1, sp.life * 1.5)})`;
        ctx.lineWidth = sp.width * (0.4 + sp.life);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        ctx.lineTo(sp.x - (sp.vx / speed) * len, sp.y - (sp.vy / speed) * len);
        ctx.stroke();
      }
      sparks.current = alive.length > 4200 ? alive.slice(-4200) : alive;

      // ── Guide arc while drawing ───────────────────────────────────────────
      if (S.phase === "drawing" && p.center && p.progress > 0.05) {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${SPARK_MID}, ${0.1 + p.progress * 0.3})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 9]);
        ctx.beginPath();
        ctx.arc(mx(p.center.x), my(p.center.y), p.radius * Math.sqrt(W * H), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      setHud((h) =>
        h.progress === p.progress && h.phase === S.phase
          ? h
          : { progress: p.progress, phase: S.phase },
      );
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  const begin = async () => {
    const v = videoRef.current;
    if (!v) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720, facingMode: "user" },
    });
    v.srcObject = stream;
    await v.play();
    await start();
  };

  const portalUp = hud.phase === "open" || hud.phase === "igniting";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#040302]">
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0" />

      {!started && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <h1 className="mb-2 text-4xl font-semibold tracking-tight text-amber-100">
              Pinch and draw a circle
            </h1>
            <p className="mb-8 max-w-sm text-sm text-amber-200/50">
              Pinch your thumb and index finger together, then sweep your hand
              around in a full circle. Pinch again to close it. Everything runs
              in this tab.
            </p>
            <button
              onClick={begin}
              disabled={loading}
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-8 py-3 text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-40"
            >
              {loading ? "Loading hand tracking..." : "Open the camera"}
            </button>
          </div>
        </div>
      )}

      {started && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
          <div className="mb-2 h-[2px] w-52 overflow-hidden rounded-full bg-amber-500/15">
            <div
              className="h-full bg-amber-400 transition-[width] duration-75"
              style={{ width: `${Math.round(hud.progress * 100)}%` }}
            />
          </div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/40">
            {portalLabel(hud.phase)} · {fps} fps
          </p>
        </div>
      )}

      {portalUp && (
        <button
          onClick={() => {
            forceClose.current = true;
          }}
          className="absolute right-6 top-6 rounded-full border border-amber-500/30 px-4 py-2 text-xs text-amber-200/70 hover:bg-amber-500/10"
        >
          close
        </button>
      )}
    </main>
  );
}
