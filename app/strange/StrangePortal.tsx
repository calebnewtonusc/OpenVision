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
  /**
   * Bound sparks are pulled onto the rim of the forming portal instead of
   * flying away. This is what makes the bits thrown off the drawn line
   * gather INTO the ring rather than scatter off it.
   */
  bind: boolean;
}

const IDLE_PROGRESS: CircleProgress = {
  progress: 0,
  sweep: 0,
  center: null,
  radius: 0,
  completed: false,
  direction: null,
  startAngle: null,
  endAngle: null,
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
  // The portal's geometry in NORMALIZED space. Kept separate from the
  // reducer, which tracks state rather than shape. Normalized x is divided by
  // image width and y by image height, so mapping each point through mx/my
  // preserves the shape the hand actually traced; collapsing it to a single
  // pixel radius does not.
  const geom = useRef({ cx: 0.5, cy: 0.5, r: 0.1 });
  // The rim that bound sparks are drawn toward, in normalized space, or null
  // when there is nothing forming.
  const attract = useRef<{ cx: number; cy: number; r: number } | null>(null);
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
      bind = false,
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
          bind,
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

      // Trace an arc of a circle defined in NORMALIZED space, mapping every
      // point through mx/my. Drawn as a polyline rather than ctx.arc because
      // the two axes scale differently, so the true shape is an ellipse on
      // screen and ctx.arc cannot express it.
      const arcPath = (
        cn: { x: number; y: number },
        rn: number,
        a0: number,
        a1: number,
        segs = 96,
      ) => {
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const a = a0 + ((a1 - a0) * i) / segs;
          const px = mx(cn.x + Math.cos(a) * rn);
          const py = my(cn.y + Math.sin(a) * rn);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      };
      // The same ellipse as a fillable path, for the interior and the bloom.
      const ellipse = (cn: { x: number; y: number }, rn: number, scale = 1) => {
        ctx.beginPath();
        ctx.ellipse(
          mx(cn.x),
          my(cn.y),
          rn * W * scale,
          rn * H * scale,
          0,
          0,
          Math.PI * 2,
        );
      };

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
        if (p.center) geom.current = { cx: p.center.x, cy: p.center.y, r: p.radius };
        attract.current = { ...geom.current };
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

      // ── The ring BUILDING along its own circumference ─────────────────────
      //
      // This is the thing the reference clips actually do and the thing the
      // first version got wrong. It used to draw a free squiggle following
      // the fingertip and then pop a finished ring into place at 100%. What
      // the portal does is burn ITSELF into existence along the arc: a
      // partial ring that grows as the hand travels and is already whole the
      // moment the circle closes. The fitted circle is what makes this
      // possible, because the rim is drawn on the circle the hand is
      // describing rather than on the exact path it wandered.
      if (S.phase === "drawing" && p.center && p.startAngle !== null && p.progress > 0.07) {
        const cn = p.center;
        const rn = p.radius;
        const swept = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, p.sweep));
        const a0 = p.startAngle;
        const a1 = a0 + swept;
        const rpx = (rn * W + rn * H) / 2;

        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";

        // The burnt-in arc, dimmer behind, in the same colour and weight as
        // the finished rim so nothing changes appearance when it closes.
        ctx.shadowBlur = 26;
        ctx.shadowColor = `rgba(${SPARK_MID}, 1)`;
        ctx.strokeStyle = `rgba(${CORE}, ${0.35 + p.progress * 0.45})`;
        ctx.lineWidth = Math.max(1.6, rpx * 0.028);
        arcPath(cn, rn, a0, a1);
        ctx.stroke();

        // A hotter, shorter segment at the leading edge, so the eye follows
        // the head rather than the whole arc.
        const headSpan = Math.sign(swept) * Math.min(Math.abs(swept), 0.55);
        ctx.shadowBlur = 40;
        ctx.strokeStyle = `rgba(${CORE}, 0.95)`;
        ctx.lineWidth = Math.max(2.2, rpx * 0.04);
        arcPath(cn, rn, a1 - headSpan, a1, 24);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Sparks thrown off the head, tangentially. The tangent in SCREEN
        // space is (sin a * W, cos a * H), because mx flips x and the two
        // axes scale differently.
        const hx = mx(cn.x + Math.cos(a1) * rn);
        const hy = my(cn.y + Math.sin(a1) * rn);
        const dir = Math.sign(swept) || 1;
        let tx = Math.sin(a1) * W * dir;
        let ty = Math.cos(a1) * H * dir;
        const tm = Math.hypot(tx, ty) || 1;
        tx /= tm;
        ty /= tm;
        spawnAt(hx, hy, tx, ty, 14, 3.2, true);
        attract.current = { cx: cn.x, cy: cn.y, r: rn };
      }
      if (S.phase === "idle" || S.phase === "open" || S.phase === "closing") {
        attract.current =
          S.phase === "open" ? { cx: geom.current.cx, cy: geom.current.cy, r: geom.current.r } : null;
      }

      // ── The portal ────────────────────────────────────────────────────────
      //
      // Drawn from the SAME fitted circle the arc was building on, so the rim
      // does not move, resize or change weight at the moment it closes. The
      // only things ignition changes are the interior opening and a flash.
      if (portalUp) {
        spin.current += 0.012;
        const ignite = ignitionAmount(S, now, IGNITE_MS);
        const shut = collapseAmount(S, now, CLOSE_MS);
        const e = ease(ignite);
        const g = geom.current;
        const rn = g.r * (1 - ease(shut));
        const cn = { x: g.cx, y: g.cy };
        const rpx = (rn * W + rn * H) / 2;
        const vis = e * (1 - shut);
        const age = (now - S.born) / 1000;

        if (rpx >= 2) {
          // Dark amber interior. Rule 4: a disc, not a hole. It fades in
          // across the ignition, which IS the hole opening. The rim is
          // already there from the draw, so this is the only thing arriving.
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = vis;
          const inner = ctx.createRadialGradient(
            mx(cn.x), my(cn.y), 0,
            mx(cn.x), my(cn.y), Math.max(rn * W, rn * H),
          );
          inner.addColorStop(0, "rgba(8, 5, 3, 1)");
          inner.addColorStop(0.72, "rgba(26, 12, 5, 1)");
          inner.addColorStop(0.94, "rgba(92, 40, 12, 0.95)");
          inner.addColorStop(1, `rgba(${SPARK_COLD}, 0.65)`);
          ctx.fillStyle = inner;
          ellipse(cn, rn);
          ctx.fill();
          ctx.globalAlpha = 1;

          ctx.globalCompositeOperation = "lighter";

          const bloom = ctx.createRadialGradient(
            mx(cn.x), my(cn.y), Math.min(rn * W, rn * H) * 0.85,
            mx(cn.x), my(cn.y), Math.max(rn * W, rn * H) * 1.7,
          );
          bloom.addColorStop(0, `rgba(${SPARK_MID}, ${0.3 * vis})`);
          bloom.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = bloom;
          ellipse(cn, rn, 1.7);
          ctx.fill();

          // The shockwave, during ignition only: a bright ring expanding past
          // the rim and dying. It carries the eye outward at the instant the
          // circle closes instead of the rim simply appearing.
          if (ignite < 1) {
            ctx.strokeStyle = `rgba(${CORE}, ${(1 - e) * 0.55})`;
            ctx.lineWidth = (1 - e) * 9 + 1;
            arcPath(cn, rn * (1 + e * 0.85), 0, Math.PI * 2);
            ctx.stroke();
          }

          // The rim. Same colour and weight as the arc that built it.
          const flicker = 0.82 + Math.sin(now / 55) * 0.1 + Math.random() * 0.08;
          const heat = 1 + (1 - e) * 1.6 + ease(shut) * 2.6;
          ctx.shadowBlur = 42 * heat;
          ctx.shadowColor = `rgba(${SPARK_MID}, 1)`;
          ctx.strokeStyle = `rgba(${CORE}, ${Math.min(1, flicker * (0.55 + vis * 0.45))})`;
          ctx.lineWidth = Math.max(1.6, rpx * 0.028) * heat;
          ctx.lineCap = "round";
          arcPath(cn, rn, 0, Math.PI * 2);
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
            let tx = Math.sin(a) * W * inward;
            let ty = Math.cos(a) * H * inward;
            const tm = Math.hypot(tx, ty) || 1;
            spawnAt(
              mx(cn.x + Math.cos(a) * rn),
              my(cn.y + Math.sin(a) * rn),
              tx / tm,
              ty / tm,
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

        // Bound sparks are sprung toward the NEAREST POINT ON THE RIM, not
        // toward the centre. Pulling to the centre makes them fall into the
        // hole; pulling to the rim makes them gather along it, which is what
        // the reference does and what reads as the ring assembling out of
        // the pieces the hand threw off. The pull ramps with age, so a spark
        // flies freely at first and is captured as it cools.
        const at = attract.current;
        if (sp.bind && at) {
          const Cx = mx(at.cx);
          const Cy = my(at.cy);
          const Rx = at.r * W;
          const Ry = at.r * H;
          const ux = (sp.x - Cx) / (Rx || 1);
          const uy = (sp.y - Cy) / (Ry || 1);
          const ul = Math.hypot(ux, uy) || 1;
          const tx2 = Cx + (ux / ul) * Rx;
          const ty2 = Cy + (uy / ul) * Ry;
          const pull = 0.055 * (1 - sp.life) + 0.012;
          sp.vx += (tx2 - sp.x) * pull;
          sp.vy += (ty2 - sp.y) * pull;
          // Extra damping so they settle onto the rim instead of orbiting it
          // forever, which looks like a bug rather than an effect.
          sp.vx *= 0.94;
          sp.vy *= 0.94;
        }

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
