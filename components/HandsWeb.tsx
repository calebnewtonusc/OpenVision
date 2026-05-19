"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useHandTracking,
  useGazeTracking,
  useDwellClick,
  useGazePinchClick,
  useTwoHandGesture,
  usePinchScroll,
  classifyGesture,
  drawGlassHand,
  GazeCursor,
  GazeCalibration,
  GESTURE_LABELS,
  HAND_CONNECTIONS,
  FINGER_TIPS,
  type GestureName,
  type HandData,
  type PinchResult,
  type RGB,
} from "@/lib/openvision";
import Script from "next/script";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────
const TIP_COLORS = ["#f59e0b", "#6366f1", "#ec4899", "#10b981", "#a855f7"];
const MODES = [
  "glass",
  "scroll",
  "particles",
  "draw",
  "bubbles",
  "portal",
] as const;
type Mode = (typeof MODES)[number];

const SCROLL_FEED: { title: string; body: string; tag: string }[] = [
  {
    title: "On-device gaze tracking",
    body: "WebGazer fits a ridge regression model to your face landmarks during calibration. Nine dots, five clicks each, 45 samples — everything runs in your tab.",
    tag: "Eye tracking",
  },
  {
    title: "Pinch detection without an SDK",
    body: "PinchDetector measures thumb-to-index distance, normalizes by palm scale, and uses hysteresis thresholds so the gesture doesn't flicker at the boundary.",
    tag: "Gestures",
  },
  {
    title: "Why spatial UIs need motion damping",
    body: "Raw landmarks jitter 2 to 4 pixels per frame at 30fps. Without smoothing, every cursor sits in a permanent earthquake. Exponential smoothing fixes it cheaply.",
    tag: "UX",
  },
  {
    title: "MediaPipe Hands at 30fps",
    body: "21 landmarks per hand, two hands, in JavaScript. The trick is keeping the inference loop async and never letting the main thread block on a send call.",
    tag: "Perf",
  },
  {
    title: "Kalman filter for gaze",
    body: "Gaze data is noisy on the order of head size, not pixel size. A small Kalman pass with a tuned process variance feels like the cursor knows what you mean.",
    tag: "Signal",
  },
  {
    title: "Dwell timing that respects intent",
    body: "1200ms feels intentional. 800ms feels accidental. Vision Pro uses around 1s with a visible progress ring so the user can bail out before commit.",
    tag: "UX",
  },
  {
    title: "Detecting handedness from one camera",
    body: "MediaPipe returns a handedness label, but it's noisy near the frame edge. Voting across the last five frames is more stable than trusting the latest result.",
    tag: "Tracking",
  },
  {
    title: "A virtual keyboard for eyes",
    body: "Big keys, predictive completion, and a dwell-to-confirm pattern. The interesting design constraint is that the user cannot look at the spacebar and the word simultaneously.",
    tag: "Input",
  },
  {
    title: "Why Vision Pro feels different",
    body: "It is not the optics. It is that gaze plus pinch removes the cursor as a mental model. You think 'that one' and the system already knows.",
    tag: "Spatial",
  },
  {
    title: "Permissions and privacy",
    body: "Camera access stays on the device. No frame ever leaves the browser. The model runs in WebAssembly, landmarks live in memory, and the tab can disable it instantly.",
    tag: "Privacy",
  },
  {
    title: "Calibration that doesn't fight you",
    body: "Show the dot, show face detection feedback, count clicks visibly. Quiet failures during calibration are the worst category of bug for eye tracking apps.",
    tag: "UX",
  },
  {
    title: "Where OpenVision goes next",
    body: "Two-hand zoom and rotate, foveated rendering for spatial panels, multi-monitor gaze handoff. The browser already has everything the headset has, minus the optics.",
    tag: "Roadmap",
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface LM {
  x: number;
  y: number;
  z: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Bubble {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
  popped: boolean;
  popAge: number;
}

interface DrawPoint {
  x: number;
  y: number;
  pressure: number;
  color: string;
}
interface DrawStroke {
  points: DrawPoint[];
  color: string;
}

interface Gesture {
  left: GestureName;
  right: GestureName;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HandsWeb() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Rendering state (refs = no re-render cost)
  const particles = useRef<Particle[]>([]);
  const bubbles = useRef<Bubble[]>([]);
  const bubbleId = useRef(0);
  const strokes = useRef<DrawStroke[]>([]);
  const currentStroke = useRef<DrawStroke | null>(null);
  const handsData = useRef<HandData[]>([]);
  const gestureRef = useRef<Gesture>({ left: "none", right: "none" });
  const pinchStateRef = useRef<{
    left: PinchResult["state"] | null;
    right: PinchResult["state"] | null;
  }>({ left: null, right: null });
  const portalAngle = useRef(0);
  const palmWipeRef = useRef(false);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const webgazerReadyRef = useRef(false);

  // React state (UI only)
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("glass");
  const [spatialOn, setSpatialOn] = useState(false);
  const [calibrating, setCalibrating] = useState(false);

  // Pinch-to-scroll handler. Enabled flag is read live from modeRef.
  const pinchScroll = usePinchScroll({
    target: scrollContentRef,
    enabled: mode === "scroll",
  });

  // Optional spatial layer: gaze, dwell, gaze + pinch, calibration.
  const dwell = useDwellClick({ dwellMs: 1200 });
  const gaze = useGazeTracking({ onSample: (s) => dwell.feed(s) });
  const gazePinch = useGazePinchClick({
    focused: dwell.focused,
    enabled: spatialOn,
  });
  const twoHand = useTwoHandGesture();

  // Lib hook: handles MediaPipe loading, run-loop, pinch detection, and gestures.
  const handTracking = useHandTracking({
    videoRef,
    onFrame: (f) => {
      handsData.current = f.hands;
      gestureRef.current = f.gestures;
      pinchStateRef.current = {
        left: f.pinches.left?.state ?? null,
        right: f.pinches.right?.state ?? null,
      };
      pinchScroll.apply(f.pinches.left);
      pinchScroll.apply(f.pinches.right);
      twoHand.update(f.pinches);
      if (spatialOn) gazePinch.feed(f.pinches);
    },
  });

  const fps = handTracking.fps;
  const handCount = handTracking.handCount;
  const gesture = {
    left: GESTURE_LABELS[handTracking.gesture.left] ?? "",
    right: GESTURE_LABELS[handTracking.gesture.right] ?? "",
  };

  const modeRef = useRef<Mode>("particles");

  // Keep modeRef in sync
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ── Bubble spawner ──────────────────────────────────────────────────────────
  const spawnBubble = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    bubbles.current.push({
      id: bubbleId.current++,
      x: Math.random() * canvas.width,
      y: canvas.height + 30,
      vx: (Math.random() - 0.5) * 2,
      vy: -(1.5 + Math.random() * 2),
      r: 20 + Math.random() * 40,
      hue: Math.random() * 360,
      popped: false,
      popAge: 0,
    });
  }, []);

  // ── Main render loop ───────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = (canvas.width = canvas.offsetWidth);
    const H = (canvas.height = canvas.offsetHeight);
    const now = performance.now();
    const currentMode = modeRef.current;
    const hands = handsData.current;

    // Mirror helper
    const mx = (x: number) => (1 - x) * W;
    const my = (y: number) => y * H;

    // ── Background ──────────────────────────────────────────────────────────
    if (currentMode === "glass") {
      // Don't fill: the video element underneath shows through the canvas.
      // A very subtle dark tint helps the glass effect read.
      ctx.fillStyle = "rgba(0,0,0,0.12)";
    } else if (currentMode === "draw") {
      ctx.fillStyle = "rgba(9,9,11,0.04)";
    } else if (currentMode === "portal") {
      ctx.fillStyle = "rgba(9,9,11,0.15)";
    } else {
      ctx.fillStyle = "rgba(9,9,11,0.75)";
    }
    ctx.fillRect(0, 0, W, H);

    // ── GLASS mode ──────────────────────────────────────────────────────────
    if (currentMode === "glass") {
      const pulse = now * 0.005;
      for (const hand of hands) {
        const accent: RGB =
          hand.side === "left" ? [167, 139, 250] : [52, 211, 153];
        const baseHue = hand.side === "left" ? 265 : 160;
        const sidePinch =
          hand.side === "left"
            ? pinchStateRef.current.left
            : pinchStateRef.current.right;
        const pinched = sidePinch
          ? ["pinching", "holding", "dragging"].includes(sidePinch)
          : false;
        drawGlassHand(ctx, hand.lm, {
          mx,
          my,
          accent,
          baseHue,
          pinched,
          pulsePhase: pulse,
        });
      }
    }

    // ── PARTICLES mode ──────────────────────────────────────────────────────
    if (currentMode === "particles") {
      // Spawn particles from all fingertips
      for (const hand of hands) {
        const lm = hand.lm;
        FINGER_TIPS.forEach((tipIdx, fi) => {
          const tip = lm[tipIdx];
          const px = mx(tip.x);
          const py = my(tip.y);
          // Velocity based on z depth (closer = more energy)
          const energy = Math.max(0, -tip.z * 8 + 1);
          const count = Math.floor(energy * 3) + 1;
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 3 * energy;
            particles.current.push({
              x: px + (Math.random() - 0.5) * 6,
              y: py + (Math.random() - 0.5) * 6,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 1,
              life: 1,
              maxLife: 0.6 + Math.random() * 0.8,
              color: TIP_COLORS[fi],
              size: 2 + Math.random() * 4 * energy,
            });
          }
        });
      }

      // Update + draw particles
      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.vx *= 0.98;
        p.life -= 0.016 / p.maxLife;
        if (p.life <= 0) continue;
        alive.push(p);
        ctx.save();
        ctx.globalAlpha = p.life * p.life;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      particles.current = alive.slice(-1200); // cap at 1200
    }

    // ── DRAW mode ───────────────────────────────────────────────────────────
    if (currentMode === "draw") {
      for (const hand of hands) {
        const lm = hand.lm;
        const indexTip = lm[8];
        const isPointing = classifyGesture(lm) === "point";
        const isOpen =
          classifyGesture(lm) === "open" ||
          classifyGesture(lm) === "almost_open";
        const px = mx(indexTip.x);
        const py = my(indexTip.y);

        // Palm wipe to clear
        if (isOpen && !palmWipeRef.current) {
          palmWipeRef.current = true;
          strokes.current = [];
          currentStroke.current = null;
          // Flash effect
          ctx.fillStyle = "rgba(255,255,255,0.05)";
          ctx.fillRect(0, 0, W, H);
        }
        if (!isOpen) palmWipeRef.current = false;

        if (isPointing) {
          const color = hand.side === "left" ? "#6366f1" : "#ec4899";
          if (!currentStroke.current) {
            currentStroke.current = { points: [], color };
            strokes.current.push(currentStroke.current);
          }
          currentStroke.current.points.push({
            x: px,
            y: py,
            pressure: 1,
            color,
          });

          // Draw cursor dot
          ctx.save();
          ctx.shadowBlur = 20;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          currentStroke.current = null;
        }
      }

      // Draw all strokes
      for (const stroke of strokes.current) {
        const pts = stroke.points;
        if (pts.length < 2) continue;
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = stroke.color;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          const mx2 = (pts[i - 1].x + pts[i].x) / 2;
          const my2 = (pts[i - 1].y + pts[i].y) / 2;
          ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, mx2, my2);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Hint
      if (hands.length === 0 || strokes.current.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Point with index finger to draw", W / 2, H / 2);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.font = "13px Inter, sans-serif";
        ctx.fillText("Open palm to clear", W / 2, H / 2 + 30);
      }
    }

    // ── BUBBLES mode ────────────────────────────────────────────────────────
    if (currentMode === "bubbles") {
      // Spawn periodically
      if (Math.random() < 0.04) spawnBubble();

      // Fingertip positions for collision
      const tips: { x: number; y: number }[] = [];
      for (const hand of hands) {
        FINGER_TIPS.forEach((ti) => {
          tips.push({ x: mx(hand.lm[ti].x), y: my(hand.lm[ti].y) });
        });
      }

      // Update + draw bubbles
      const alive: Bubble[] = [];
      for (const b of bubbles.current) {
        if (b.popped) {
          b.popAge += 0.05;
          if (b.popAge >= 1) continue;
          // Pop ring
          ctx.save();
          ctx.globalAlpha = 1 - b.popAge;
          ctx.strokeStyle = `hsl(${b.hue},80%,65%)`;
          ctx.shadowBlur = 20;
          ctx.shadowColor = `hsl(${b.hue},80%,65%)`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + b.popAge * 40, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          alive.push(b);
          continue;
        }

        // Physics
        b.x += b.vx;
        b.y += b.vy;
        b.vx += (Math.random() - 0.5) * 0.1;
        if (b.y + b.r < 0) continue; // off screen top

        // Collision with fingertips
        let popped = false;
        for (const t of tips) {
          if (Math.hypot(t.x - b.x, t.y - b.y) < b.r + 12) {
            b.popped = true;
            popped = true;
            break;
          }
        }
        if (!popped) alive.push(b);
        else {
          alive.push(b);
          continue;
        }

        // Draw bubble
        ctx.save();
        // Main circle
        const grad = ctx.createRadialGradient(
          b.x - b.r * 0.3,
          b.y - b.r * 0.3,
          b.r * 0.1,
          b.x,
          b.y,
          b.r,
        );
        grad.addColorStop(0, `hsla(${b.hue},70%,80%,0.25)`);
        grad.addColorStop(0.8, `hsla(${b.hue},60%,60%,0.1)`);
        grad.addColorStop(1, `hsla(${b.hue},80%,65%,0.4)`);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        // Rim
        ctx.strokeStyle = `hsla(${b.hue},80%,70%,0.6)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Specular highlight
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.32, b.y - b.r * 0.32, b.r * 0.18, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fill();
        ctx.restore();
      }
      bubbles.current = alive;

      if (hands.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Pop the bubbles with your fingertips", W / 2, H / 2);
      }
    }

    // ── PORTAL mode ─────────────────────────────────────────────────────────
    if (currentMode === "portal") {
      portalAngle.current += 0.01;
      const t = portalAngle.current;

      // Background radial pulse from center
      const cx = W / 2,
        cy = H / 2;
      for (let ring = 0; ring < 6; ring++) {
        const r = (t * 80 + ring * 60) % (Math.max(W, H) * 0.8);
        const alpha = 0.06 * (1 - r / (Math.max(W, H) * 0.8));
        ctx.save();
        ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Fingertip orbital trails
      for (const hand of hands) {
        const lm = hand.lm;
        FINGER_TIPS.forEach((tipIdx, fi) => {
          const tip = lm[tipIdx];
          const px = mx(tip.x);
          const py = my(tip.y);
          const color = TIP_COLORS[fi];
          const depth = Math.max(0, -tip.z * 5 + 1);

          // Spawn particles trailing upward
          for (let i = 0; i < 4; i++) {
            particles.current.push({
              x: px + (Math.random() - 0.5) * 4,
              y: py,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -(1 + Math.random() * 2),
              life: 1,
              maxLife: 0.4 + Math.random() * 0.5,
              color,
              size: 3 + depth * 3,
            });
          }

          // Glowing tip ring
          ctx.save();
          ctx.shadowBlur = 30 * depth;
          ctx.shadowColor = color;
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.arc(px, py, 8 + depth * 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        });

        // Draw skeleton with glow
        const lm2 = hand.lm;
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = "#6366f1";
        ctx.strokeStyle = "rgba(99,102,241,0.5)";
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(mx(lm2[a].x), my(lm2[a].y));
          ctx.lineTo(mx(lm2[b].x), my(lm2[b].y));
          ctx.stroke();
        }
        ctx.restore();
      }

      // Update particles
      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy -= 0.04; // float upward (negative gravity)
        p.vx *= 0.99;
        p.life -= 0.02 / p.maxLife;
        if (p.life <= 0) continue;
        alive.push(p);
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      particles.current = alive.slice(-2000);

      if (hands.length === 0) {
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.font = "bold 18px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Move your hands through the portal", W / 2, H / 2);
      }
    }

    // ── Skeleton overlay (all modes except draw/portal/glass) ───────────────
    if (
      currentMode !== "draw" &&
      currentMode !== "portal" &&
      currentMode !== "glass"
    ) {
      for (const hand of hands) {
        const lm = hand.lm;
        const color = hand.side === "left" ? "#a78bfa" : "#34d399";

        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.strokeStyle = `${color}60`;
        ctx.lineWidth = 1.5;
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(mx(lm[a].x), my(lm[a].y));
          ctx.lineTo(mx(lm[b].x), my(lm[b].y));
          ctx.stroke();
        }
        ctx.restore();

        // Joint dots
        for (let i = 0; i < lm.length; i++) {
          const isTip = FINGER_TIPS.includes(i);
          ctx.beginPath();
          ctx.arc(mx(lm[i].x), my(lm[i].y), isTip ? 5 : 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isTip ? color : `${color}80`;
          ctx.fill();
        }
      }
    }

    // ── Gesture labels on wrists ────────────────────────────────────────────
    for (const hand of hands) {
      const g =
        hand.side === "left"
          ? GESTURE_LABELS[gestureRef.current.left] || ""
          : GESTURE_LABELS[gestureRef.current.right] || "";
      if (!g) continue;
      const wrist = hand.lm[0];
      const wx = mx(wrist.x);
      const wy = my(wrist.y) + 32;
      ctx.fillStyle = hand.side === "left" ? "#a78bfa" : "#34d399";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(g, wx, wy);
    }
  }, [spawnBubble]);

  // ── Camera + tracking init via useHandTracking ─────────────────────────────
  const start = useCallback(async () => {
    setLoading(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Camera denied");
      setLoading(false);
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }

    try {
      await handTracking.start();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hand tracking failed");
      setLoading(false);
      return;
    }

    // Independent draw loop (lib hook runs its own inference loop)
    const loop = () => {
      drawRafRef.current = requestAnimationFrame(loop);
      drawFrame();
    };
    loop();

    // Seed bubbles for bubbles mode
    for (let i = 0; i < 8; i++) setTimeout(() => spawnBubble(), i * 300);

    setStarted(true);
    setLoading(false);
    toast.success("Hand tracking active");
  }, [drawFrame, spawnBubble, handTracking]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(drawRafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#09090b",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Lazy-load WebGazer once the user opts into spatial mode */}
      {spatialOn && (
        <Script
          src="https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.js"
          strategy="afterInteractive"
          onReady={() => {
            webgazerReadyRef.current = true;
          }}
        />
      )}

      {/* Gaze cursor: only renders when gaze is active */}
      {spatialOn && gaze.started && (
        <GazeCursor
          x={gaze.gaze.x}
          y={gaze.gaze.y}
          dwellProgress={dwell.dwellProgress}
        />
      )}

      {/* 9-point gaze calibration overlay */}
      <GazeCalibration
        active={calibrating}
        onRecord={(x, y) => gaze.record(x, y)}
        onComplete={() => {
          setCalibrating(false);
          toast.success("Calibration complete");
        }}
        onCancel={() => setCalibrating(false)}
      />

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background:
                "linear-gradient(135deg,rgba(168,85,247,0.3),rgba(139,92,246,0.15))",
              border: "1px solid rgba(168,85,247,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c084fc"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 11V6a2 2 0 0 0-4 0v5" />
              <path d="M14 10V4a2 2 0 0 0-4 0v6" />
              <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          </div>
          <span
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: "-0.01em",
            }}
          >
            HandsWeb
          </span>
        </div>

        {started && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* Mode switcher */}
            <div
              style={{
                display: "flex",
                gap: 4,
                padding: "3px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {MODES.map((m) => (
                <button
                  key={m}
                  data-gaze-target="true"
                  onClick={() => {
                    setMode(m);
                    if (m !== "draw") {
                      strokes.current = [];
                      currentStroke.current = null;
                    }
                    if (m !== "particles" && m !== "portal")
                      particles.current = [];
                    if (m !== "bubbles") bubbles.current = [];
                  }}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 9,
                    border: "none",
                    background:
                      mode === m ? "rgba(99,102,241,0.25)" : "transparent",
                    color: mode === m ? "#818cf8" : "#52525b",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "color 0.15s, background 0.15s",
                    textTransform: "capitalize",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            {twoHand.state.active && (
              <div
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: "rgba(251,191,36,0.14)",
                  border: "1px solid rgba(251,191,36,0.35)",
                  color: "#fbbf24",
                  fontSize: 11,
                  fontWeight: 700,
                  fontFamily:
                    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                2H · {twoHand.state.scale.toFixed(2)}x ·{" "}
                {((twoHand.state.rotation * 180) / Math.PI).toFixed(0)}°
              </div>
            )}

            {/* Spatial toggle: enables gaze + dwell + gaze-pinch click */}
            <button
              onClick={() => {
                if (spatialOn) {
                  setSpatialOn(false);
                  return;
                }
                setSpatialOn(true);
                if (!gaze.started) {
                  gaze.start().catch((err) => {
                    toast.error(
                      `Gaze tracking unavailable: ${err instanceof Error ? err.message : String(err)}`,
                    );
                    setSpatialOn(false);
                  });
                }
              }}
              style={{
                padding: "5px 14px",
                borderRadius: 10,
                border: `1px solid ${spatialOn ? "rgba(99,102,241,0.45)" : "rgba(255,255,255,0.08)"}`,
                background: spatialOn
                  ? "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.18))"
                  : "rgba(255,255,255,0.04)",
                color: spatialOn ? "#c4b5fd" : "#71717a",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {spatialOn ? "Spatial: ON" : "Spatial: OFF"}
            </button>

            {spatialOn && gaze.started && (
              <button
                onClick={() => setCalibrating(true)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(167,139,250,0.3)",
                  background: "rgba(167,139,250,0.12)",
                  color: "#c4b5fd",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Calibrate
              </button>
            )}

            {/* Gesture indicators */}
            {(gesture.left || gesture.right) && (
              <div style={{ display: "flex", gap: 6 }}>
                {gesture.left && (
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: "rgba(167,139,250,0.1)",
                      border: "1px solid rgba(167,139,250,0.2)",
                      color: "#a78bfa",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    L: {gesture.left}
                  </div>
                )}
                {gesture.right && (
                  <div
                    style={{
                      padding: "4px 10px",
                      borderRadius: 20,
                      background: "rgba(52,211,153,0.1)",
                      border: "1px solid rgba(52,211,153,0.2)",
                      color: "#34d399",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    R: {gesture.right}
                  </div>
                )}
              </div>
            )}

            {/* Status */}
            <div
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                background:
                  fps > 20 ? "rgba(52,211,153,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${fps > 20 ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.2)"}`,
                color: fps > 20 ? "#34d399" : "#f87171",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {fps} fps
            </div>
            <div
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                background:
                  handCount > 0
                    ? "rgba(168,85,247,0.1)"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${handCount > 0 ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.08)"}`,
                color: handCount > 0 ? "#c084fc" : "#52525b",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {handCount === 0
                ? "No hands"
                : `${handCount} hand${handCount > 1 ? "s" : ""}`}
            </div>

            <a
              href="/vision"
              style={{
                padding: "6px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#71717a",
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Vision
            </a>
          </div>
        )}
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Hidden video for MediaPipe input, visible in glass mode as backdrop */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={
            mode === "glass" && started
              ? {
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  transform: "scaleX(-1)",
                  filter: "saturate(0.6) brightness(0.55) contrast(1.08)",
                  zIndex: 0,
                  pointerEvents: "none",
                }
              : {
                  position: "absolute",
                  opacity: 0,
                  pointerEvents: "none",
                  width: 1,
                  height: 1,
                }
          }
        />

        {!started ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ textAlign: "center", padding: "0 32px" }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 28,
                  background:
                    "linear-gradient(135deg,rgba(168,85,247,0.2),rgba(99,102,241,0.1))",
                  border: "1px solid rgba(168,85,247,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 24px",
                }}
              >
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 11V6a2 2 0 0 0-4 0v5" />
                  <path d="M14 10V4a2 2 0 0 0-4 0v6" />
                  <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </svg>
              </div>
              <h1
                style={{
                  color: "#fff",
                  fontSize: 28,
                  fontWeight: 700,
                  margin: "0 0 10px",
                  letterSpacing: "-0.02em",
                }}
              >
                Hand Tracking Sandbox
              </h1>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#c4b5fd", fontWeight: 600 }}>Glass</span>{" "}
                : frosted glass hands overlaid on your camera
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#a78bfa", fontWeight: 600 }}>
                  Particles
                </span>{" "}
                : fingertip emission trail
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#ec4899", fontWeight: 600 }}>Draw</span>{" "}
                : paint with your index finger, wipe with open palm
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#10b981", fontWeight: 600 }}>
                  Bubbles
                </span>{" "}
                : pop them with your fingertips
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#6366f1", fontWeight: 600 }}>
                  Portal
                </span>{" "}
                : hands glow through the void
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                  Scroll
                </span>{" "}
                : pinch and move up or down to scroll a real feed
              </p>
              <p
                style={{
                  color: "#3f3f46",
                  fontSize: 12,
                  lineHeight: 1.7,
                  margin: "0 0 32px",
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                Toggle{" "}
                <span style={{ color: "#c4b5fd", fontWeight: 600 }}>
                  Spatial
                </span>{" "}
                in the header to add eye tracking, dwell-click, and look + pinch
                across any mode.
              </p>
              <button
                onClick={start}
                disabled={loading}
                style={{
                  padding: "14px 40px",
                  borderRadius: 16,
                  border: "none",
                  background: loading
                    ? "rgba(168,85,247,0.3)"
                    : "linear-gradient(135deg,#a855f7,#6366f1)",
                  boxShadow: loading
                    ? "none"
                    : "0 4px 32px rgba(168,85,247,0.4)",
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "-0.01em",
                }}
              >
                {loading ? "Starting…" : "Start"}
              </button>
              <p style={{ color: "#3f3f46", fontSize: 11, marginTop: 14 }}>
                Camera stays local. Nothing leaves your browser.
              </p>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 1,
            }}
          />
        )}

        {started && mode === "scroll" && (
          <div
            ref={scrollContentRef}
            style={{
              position: "absolute",
              top: 24,
              bottom: 24,
              left: "50%",
              transform: "translateX(-50%)",
              width: "min(680px, calc(100% - 32px))",
              overflowY: "auto",
              borderRadius: 20,
              background: "rgba(9,9,11,0.78)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
              zIndex: 5,
            }}
          >
            <div style={{ padding: "28px 28px 14px" }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#a78bfa",
                  marginBottom: 8,
                }}
              >
                Pinch and drag to scroll
              </div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#fafafa",
                  letterSpacing: "-0.02em",
                  margin: 0,
                  lineHeight: 1.15,
                }}
              >
                Field notes on building OpenVision
              </h2>
              <p
                style={{
                  fontSize: 13,
                  color: "#71717a",
                  marginTop: 10,
                  lineHeight: 1.55,
                }}
              >
                Close your thumb and index finger, then move your hand up or
                down. Trackpad still works too.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: "0 20px 28px",
              }}
            >
              {SCROLL_FEED.map((item) => (
                <article
                  key={item.title}
                  style={{
                    padding: 18,
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#818cf8",
                      background: "rgba(99,102,241,0.12)",
                      border: "1px solid rgba(99,102,241,0.22)",
                      padding: "3px 8px",
                      borderRadius: 999,
                      marginBottom: 10,
                    }}
                  >
                    {item.tag}
                  </div>
                  <h3
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "#fafafa",
                      margin: "0 0 6px",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: "#a1a1aa",
                      margin: 0,
                      lineHeight: 1.6,
                    }}
                  >
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
    </div>
  );
}
