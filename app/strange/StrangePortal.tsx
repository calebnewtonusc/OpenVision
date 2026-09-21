"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking } from "@/lib/openvision/react/useHandTracking";
import { CircleGestureDetector, type CircleProgress } from "@/lib/openvision/core/circle";
import { FINGER_TIPS } from "@/lib/openvision/core/skeleton";
import type { HandFrame } from "@/lib/openvision/react/useHandTracking";

/**
 * Draw a circle in the air, get a Doctor Strange portal.
 *
 * THE VISUAL RULES came from 24 frames of two reference clips, not from
 * memory, and four of them contradict what "an orange glowing ring" makes you
 * reach for by default:
 *
 *  1. Sparks are LONG THIN STREAKS, not dots. Every particle is a line drawn
 *     along its own velocity. This is the single biggest difference between
 *     this and the indigo portal already in HandsWeb, which draws arcs.
 *  2. They leave tangentially and curve outward, a catherine wheel, not a
 *     radial burst. One angular drag term produces the whole look.
 *  3. Additive blending. `globalCompositeOperation = "lighter"` is what makes
 *     overlapping sparks bloom to white instead of muddying. Fire on canvas is
 *     mostly this one line.
 *  4. The interior is NOT transparent and NOT a scene. It is a dark disc, near
 *     black at the centre, warm amber where it meets the rim.
 *
 * The rim itself is thin, about 3% of the radius, with a white-gold core.
 */

// Sampled off the reference frames rather than picked.
const CORE = "255, 236, 189"; // white-gold rim core
const SPARK_HOT = "255, 196, 94";
const SPARK_MID = "255, 141, 44";
const SPARK_COLD = "214, 74, 16";

type Phase = "idle" | "drawing" | "igniting" | "open" | "closing";

// The arc catching fire, and the hole shutting. Both were instant before and
// the snap was the single worst thing about it.
const IGNITE_MS = 520;
const CLOSE_MS = 380;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function portalLabel(p: Phase) {
  if (p === "open") return "pinch to close";
  if (p === "igniting") return "opening";
  if (p === "closing") return "closing";
  return "pinch, then circle";
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  heat: number; // 0 cold, 1 white hot
  width: number;
}

export default function StrangePortal() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const detector = useRef(new CircleGestureDetector());
  const sparks = useRef<Spark[]>([]);
  const comet = useRef<{ x: number; y: number; t: number }[]>([]);
  // The drawn arc, kept after completion so it can fade INTO the ring instead
  // of being deleted the frame the ring appears.
  const ghost = useRef<{ x: number; y: number }[]>([]);
  const phase = useRef<Phase>("idle");
  const ring = useRef({ x: 0, y: 0, r: 0, born: 0, spin: 0, closeAt: 0 });
  // A pinch both opens and closes. Without this the pinch that closes the
  // portal is still held on the next frame and immediately starts drawing the
  // next one, so it flickers shut and open in your hand.
  const armed = useRef(true);
  const progress = useRef(0);
  const frame = useRef<HandFrame | null>(null);

  const [hud, setHud] = useState({ started: false, progress: 0, phase: "idle" as Phase });

  // Selfie view: MediaPipe x runs left to right across the image, and the video
  // is mirrored, so screen x is flipped. Getting this wrong makes the portal
  // track the wrong way and feels broken long before it looks wrong.
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
        // The ratio between these two is what makes it a catherine wheel
        // rather than either a ring of sitting embers or a starburst.
        const spread = (Math.random() - 0.5) * 0.9;
        const s = speed * (0.4 + Math.random() * 1.1);
        sparks.current.push({
          x,
          y,
          vx: (tangentX + spread * -tangentY) * s,
          vy: (tangentY + spread * tangentX) * s,
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

      // Slight persistence instead of a hard clear: this is the motion blur
      // that turns discrete frames into streaks the eye reads as sparks.
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(4, 3, 2, 0.30)";
      ctx.fillRect(0, 0, W, H);

      const f = frame.current;
      const hand = f?.hands?.[0];
      const lm = hand?.lm ?? null;

      const mx = (nx: number) => (1 - nx) * W;
      const my = (ny: number) => ny * H;

      // THE PINCH IS BOTH THE GATE AND THE PEN. `PinchResult.center` is
      // already the midpoint between thumb tip and index tip, computed every
      // frame, so the tracked point is literally the spot between his pinched
      // fingers. Gating on it removes every accidental fire: a hand waving, a
      // reach for the keyboard, a scratched nose. None of those draw a portal
      // any more, and an open hand moving in a circle does nothing at all.
      const pinch = f?.pinches?.right?.isPinched
        ? f.pinches.right
        : f?.pinches?.left?.isPinched
          ? f.pinches.left
          : null;

      const IDLE: CircleProgress = {
        progress: 0,
        sweep: 0,
        center: null,
        radius: 0,
        completed: false,
        direction: null,
      };
      let p: CircleProgress;
      if (pinch?.center) {
        p = detector.current.push(pinch.center.x, pinch.center.y, now);
      } else {
        // Releasing the pinch abandons the circle. Half a circle drawn, let
        // go, draw the other half a second later is not one gesture and must
        // not be treated as one.
        detector.current.reset();
        p = IDLE;
        if (phase.current === "drawing") {
          phase.current = "idle";
          comet.current = [];
        }
      }
      progress.current = p.progress;

      const portalUp =
        phase.current === "igniting" ||
        phase.current === "open" ||
        phase.current === "closing";

      // ── Fingertips, so the hand is visible before anything is drawn ───────
      if (lm && !portalUp) {
        ctx.globalCompositeOperation = "lighter";
        for (const t of FINGER_TIPS) {
          const fx = mx(lm[t].x);
          const fy = my(lm[t].y);
          const hot = pinch ? 0.55 : 0.2;
          ctx.fillStyle = `rgba(${SPARK_MID}, ${hot})`;
          ctx.beginPath();
          ctx.arc(fx, fy, pinch ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── The comet: the pinch point while the circle is being drawn ────────
      if (pinch?.center && !portalUp) {
        const tx = mx(pinch.center.x);
        const ty = my(pinch.center.y);
        const prev = comet.current[comet.current.length - 1];
        comet.current.push({ x: tx, y: ty, t: now });
        if (comet.current.length > 46) comet.current.shift();

        if (prev && p.progress > 0.02) {
          phase.current = "drawing";
          let dx = tx - prev.x;
          let dy = ty - prev.y;
          const mag = Math.hypot(dx, dy) || 1;
          dx /= mag;
          dy /= mag;
          // More sparks the faster the hand moves, which is what makes a
          // confident sweep look better than a timid one.
          const n = Math.min(26, 4 + Math.floor(mag * 0.9));
          spawnAt(tx, ty, dx, dy, n, 2.6);
        }
      }

      // Burning trail of what has been drawn so far.
      if (phase.current === "drawing" && comet.current.length > 2) {
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

      // ── Completion ────────────────────────────────────────────────────────
      if (p.completed && p.center) {
        phase.current = "igniting";
        ring.current = {
          x: mx(p.center.x),
          y: my(p.center.y),
          // The portal is the circle he actually drew. The old code floored
          // this at 90px and scaled it by 1.5, so a small careful circle
          // produced a huge ring in a different place, which is most of why
          // the transition felt wrong. Normalized coords mix the two axes, so
          // sqrt(W*H) is the isotropic conversion back to pixels.
          r: p.radius * Math.sqrt(W * H),
          born: now,
          spin: 0,
          closeAt: 0,
        };
        ghost.current = comet.current.map((c) => ({ x: c.x, y: c.y }));
        comet.current = [];
        // The flash that sells the moment it closes.
        const R = ring.current;
        for (let i = 0; i < 260; i++) {
          const a = Math.random() * Math.PI * 2;
          spawnAt(
            R.x + Math.cos(a) * R.r,
            R.y + Math.sin(a) * R.r,
            -Math.sin(a),
            Math.cos(a),
            1,
            5.5,
          );
        }
      }

      // ── Pinch to close ────────────────────────────────────────────────────
      if (
        (phase.current === "open" || phase.current === "igniting") &&
        pinch &&
        armed.current
      ) {
        phase.current = "closing";
        ring.current.closeAt = now;
        armed.current = false;
      }
      if (!pinch) armed.current = true;

      // ── The portal: igniting, open, or closing ────────────────────────────
      if (
        phase.current === "igniting" ||
        phase.current === "open" ||
        phase.current === "closing"
      ) {
        const R = ring.current;
        const age = (now - R.born) / 1000;
        R.spin += 0.012;

        // `ignite` runs 0 to 1 as the drawn arc catches. `shut` runs 0 to 1 as
        // it collapses. Everything below is scaled by them, so there is no
        // frame where something appears at full strength out of nothing.
        let ignite = 1;
        let shut = 0;
        if (phase.current === "igniting") {
          ignite = Math.min(1, (now - R.born) / IGNITE_MS);
          if (ignite >= 1) phase.current = "open";
        }
        if (phase.current === "closing") {
          shut = Math.min(1, (now - R.closeAt) / CLOSE_MS);
          if (shut >= 1) {
            phase.current = "idle";
            detector.current.reset();
            comet.current = [];
          }
        }
        const e = ease(ignite);
        // Snap out from slightly inside the drawn circle, then collapse to a
        // point. Not a grow-from-zero: he drew it at this size and it should
        // arrive there.
        const rad = R.r * (0.86 + 0.14 * e) * (1 - ease(shut));
        const vis = e * (1 - shut);
        if (rad < 2) {
          // Fully collapsed. Nothing left to draw this frame.
        } else {

        // Dark amber interior. Rule 4: a disc, not a hole. It fades in across
        // the ignition, which is the hole opening.
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = vis;
        const inner = ctx.createRadialGradient(R.x, R.y, 0, R.x, R.y, rad);
        inner.addColorStop(0, "rgba(8, 5, 3, 1)");
        inner.addColorStop(0.72, "rgba(26, 12, 5, 1)");
        inner.addColorStop(0.94, "rgba(92, 40, 12, 0.95)");
        inner.addColorStop(1, `rgba(${SPARK_COLD}, 0.65)`);
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(R.x, R.y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.globalCompositeOperation = "lighter";

        // Outer bloom.
        const bloom = ctx.createRadialGradient(R.x, R.y, rad * 0.85, R.x, R.y, rad * 1.7);
        bloom.addColorStop(0, `rgba(${SPARK_MID}, ${0.3 * vis})`);
        bloom.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(R.x, R.y, rad * 1.7, 0, Math.PI * 2);
        ctx.fill();

        // The drawn arc, fading out as the rim takes over. Without this the
        // trail is deleted on the same frame the ring appears, which is a cut.
        if (ignite < 1 && ghost.current.length > 2) {
          const a = 1 - ease(ignite);
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
        } else if (ignite >= 1 && ghost.current.length) {
          ghost.current = [];
        }

        // The shockwave. A bright ring that expands past the portal and fades
        // during ignition only. This is what carries the eye from the drawn
        // arc to the finished hole instead of cutting between them.
        if (ignite < 1) {
          const w = ease(ignite);
          ctx.strokeStyle = `rgba(${CORE}, ${(1 - w) * 0.55})`;
          ctx.lineWidth = (1 - w) * 9 + 1;
          ctx.beginPath();
          ctx.arc(R.x, R.y, rad * (1 + w * 0.85), 0, Math.PI * 2);
          ctx.stroke();
        }

        // The rim. Thin, white-gold core, flickering. During ignition it is
        // brighter and thicker, so the arc reads as catching rather than as a
        // finished ring appearing.
        const flicker = 0.82 + Math.sin(now / 55) * 0.1 + Math.random() * 0.08;
        const heat = 1 + (1 - ease(ignite)) * 2.2 + ease(shut) * 2.6;
        ctx.shadowBlur = 42 * heat;
        ctx.shadowColor = `rgba(${SPARK_MID}, 1)`;
        ctx.strokeStyle = `rgba(${CORE}, ${Math.min(1, flicker * (0.35 + vis))})`;
        ctx.lineWidth = Math.max(1.6, rad * 0.028) * heat;
        ctx.beginPath();
        ctx.arc(R.x, R.y, rad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Sparks streaming off the rim. Heaviest during ignition, and during
        // the collapse they are thrown inward so the portal looks sucked shut
        // rather than simply scaled down.
        const emit =
          phase.current === "igniting" ? 30 : phase.current === "closing" ? 22 : age < 0.6 ? 16 : 7;
        for (let i = 0; i < emit; i++) {
          const a = Math.random() * Math.PI * 2 + R.spin;
          const inward = phase.current === "closing" ? -1 : 1;
          spawnAt(
            R.x + Math.cos(a) * rad,
            R.y + Math.sin(a) * rad,
            -Math.sin(a) * inward,
            Math.cos(a) * inward,
            1,
            phase.current === "igniting" ? 5.0 : 3.4,
          );
        }
        }
      }

      // ── Sparks. Rule 1 and 2 live here. ───────────────────────────────────
      ctx.globalCompositeOperation = "lighter";
      const alive: Spark[] = [];
      for (const s of sparks.current) {
        // Angular drag: rotate the velocity a little every frame. This one
        // term is the curve. Without it the sparks fly straight and the whole
        // thing reads as a firework instead of a portal.
        const c = Math.cos(0.035);
        const sn = Math.sin(0.035);
        const nvx = s.vx * c - s.vy * sn;
        const nvy = s.vx * sn + s.vy * c;
        s.vx = nvx * 0.975;
        s.vy = nvy * 0.975 + 0.055; // gravity: embers fall and settle

        s.x += s.vx;
        s.y += s.vy;
        s.life -= s.decay;
        if (s.life <= 0) continue;
        alive.push(s);

        // Drawn as a LINE along velocity, length scaled by speed. Rule 1.
        const speed = Math.hypot(s.vx, s.vy);
        const len = Math.min(26, 2 + speed * 3.1);
        const heat = s.heat * s.life;
        const col =
          heat > 0.62 ? CORE : heat > 0.3 ? SPARK_HOT : heat > 0.14 ? SPARK_MID : SPARK_COLD;

        ctx.strokeStyle = `rgba(${col}, ${Math.min(1, s.life * 1.5)})`;
        ctx.lineWidth = s.width * (0.4 + s.life);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - (s.vx / speed) * len, s.y - (s.vy / speed) * len);
        ctx.stroke();
      }
      sparks.current = alive.length > 4200 ? alive.slice(-4200) : alive;

      // ── Progress arc while drawing ────────────────────────────────────────
      if (phase.current === "drawing" && p.center && p.progress > 0.05) {
        const cx = mx(p.center.x);
        const cy = my(p.center.y);
        const r = p.radius * Math.sqrt(W * H);
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(${SPARK_MID}, ${0.10 + p.progress * 0.3})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 9]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      setHud((h) =>
        h.progress === p.progress && h.phase === phase.current && h.started === started
          ? h
          : { started, progress: p.progress, phase: phase.current },
      );
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

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

  const closePortal = () => {
    // Same collapse the pinch triggers, so the button and the gesture do not
    // look like two different features.
    if (phase.current === "open" || phase.current === "igniting") {
      phase.current = "closing";
      ring.current.closeAt = performance.now();
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#040302]">
      <video ref={videoRef} autoPlay muted playsInline className="hidden" />
      <canvas ref={canvasRef} className="absolute inset-0" />

      {!hud.started && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <h1 className="mb-2 text-4xl font-semibold tracking-tight text-amber-100">
              Pinch and draw a circle
            </h1>
            <p className="mb-8 max-w-sm text-sm text-amber-200/50">
              Pinch your thumb and index finger together, then sweep your hand
              around in a full circle. Let go to cancel. Everything runs in
              this tab.
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

      {hud.started && (
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

      {(hud.phase === "open" || hud.phase === "igniting") && (
        <button
          onClick={closePortal}
          className="absolute right-6 top-6 rounded-full border border-amber-500/30 px-4 py-2 text-xs text-amber-200/70 hover:bg-amber-500/10"
        >
          close
        </button>
      )}
    </main>
  );
}
