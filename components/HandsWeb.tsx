"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PinchDetector } from "@/hooks/usePinch";
import { toast } from "sonner";

// ── Constants ─────────────────────────────────────────────────────────────────
const CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const TIP_COLORS = ["#f59e0b", "#6366f1", "#ec4899", "#10b981", "#a855f7"];
const MODES = ["particles", "draw", "bubbles", "portal"] as const;
type Mode = (typeof MODES)[number];

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
  left: string;
  right: string;
}

// ── Gesture classifier ────────────────────────────────────────────────────────
function dist(a: LM, b: LM) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function classifyGesture(lm: LM[]): string {
  if (!lm || lm.length < 21) return "none";
  const wrist = lm[0];
  // Finger extended = tip is above knuckle (lower y = higher on screen)
  const extended = [
    // Thumb: compare tip to base
    dist(lm[4], lm[0]) > dist(lm[3], lm[0]),
    lm[8].y < lm[6].y, // index
    lm[12].y < lm[10].y, // middle
    lm[16].y < lm[14].y, // ring
    lm[20].y < lm[18].y, // pinky
  ];
  const [thumb, index, middle, ring, pinky] = extended;
  const count = extended.filter(Boolean).length;
  const pinchRatio = dist(lm[4], lm[8]) / Math.max(dist(lm[0], lm[9]), 0.001);

  if (pinchRatio < 0.38) return "pinch";
  if (!thumb && !index && !middle && !ring && !pinky) return "fist";
  if (count === 5) return "open";
  if (index && !middle && !ring && !pinky) return "point";
  if (index && middle && !ring && !pinky) return "peace";
  if (thumb && !index && !middle && !ring && !pinky) return "thumbs_up";
  if (!thumb && !index && !middle && !ring && pinky) return "pinky";
  if (count >= 4) return "almost_open";
  return "custom";
}

const GESTURE_LABELS: Record<string, string> = {
  none: "",
  fist: "Fist",
  open: "Open",
  point: "Point",
  peace: "Peace",
  thumbs_up: "Thumbs up",
  pinky: "Pinky up",
  pinch: "Pinch",
  almost_open: "Almost open",
  custom: "",
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function HandsWeb() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const handsRef = useRef<{
    send: (i: { image: HTMLVideoElement }) => Promise<void>;
    close: () => void;
  } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sendingRef = useRef(false);
  const pinchL = useRef(new PinchDetector());
  const pinchR = useRef(new PinchDetector());

  // Rendering state (refs = no re-render cost)
  const particles = useRef<Particle[]>([]);
  const bubbles = useRef<Bubble[]>([]);
  const bubbleId = useRef(0);
  const strokes = useRef<DrawStroke[]>([]);
  const currentStroke = useRef<DrawStroke | null>(null);
  const handsData = useRef<{ lm: LM[]; side: string }[]>([]);
  const gestureRef = useRef<Gesture>({ left: "none", right: "none" });
  const portalAngle = useRef(0);
  const palmWipeRef = useRef(false);

  // React state (UI only)
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("particles");
  const [fps, setFps] = useState(0);
  const [handCount, setHandCount] = useState(0);
  const [gesture, setGesture] = useState<Gesture>({ left: "", right: "" });
  const fpsFrames = useRef(0);
  const fpsLast = useRef(performance.now());
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
    if (currentMode === "draw") {
      ctx.fillStyle = "rgba(9,9,11,0.04)";
    } else if (currentMode === "portal") {
      ctx.fillStyle = "rgba(9,9,11,0.15)";
    } else {
      ctx.fillStyle = "rgba(9,9,11,0.75)";
    }
    ctx.fillRect(0, 0, W, H);

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
        for (const [a, b] of CONNECTIONS) {
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

    // ── Skeleton overlay (all modes except draw) ────────────────────────────
    if (currentMode !== "draw" && currentMode !== "portal") {
      for (const hand of hands) {
        const lm = hand.lm;
        const color = hand.side === "left" ? "#a78bfa" : "#34d399";

        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = color;
        ctx.strokeStyle = `${color}60`;
        ctx.lineWidth = 1.5;
        for (const [a, b] of CONNECTIONS) {
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

  // ── MediaPipe init ─────────────────────────────────────────────────────────
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

    await new Promise<void>((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>).Hands) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
      s.crossOrigin = "anonymous";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load MediaPipe"));
      document.head.appendChild(s);
    });

    type HandLM = { x: number; y: number; z: number };
    type HResults = {
      multiHandLandmarks?: HandLM[][];
      multiHandedness?: { label: string }[];
    };
    type HInstance = {
      setOptions: (o: Record<string, unknown>) => void;
      onResults: (cb: (r: HResults) => void) => void;
      send: (i: { image: HTMLVideoElement }) => Promise<void>;
      close: () => void;
    };

    const HC = (
      window as unknown as {
        Hands: new (o: Record<string, unknown>) => HInstance;
      }
    ).Hands;
    const hi = new HC({
      locateFile: (f: string) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    });
    hi.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.6,
    });

    hi.onResults((results: HResults) => {
      const now = performance.now();
      fpsFrames.current++;
      if (now - fpsLast.current >= 1000) {
        setFps(fpsFrames.current);
        fpsFrames.current = 0;
        fpsLast.current = now;
      }

      if (!results.multiHandLandmarks?.length) {
        pinchL.current.update(null, now);
        pinchR.current.update(null, now);
        handsData.current = [];
        setHandCount(0);
        gestureRef.current = { left: "none", right: "none" };
        setGesture({ left: "", right: "" });
        return;
      }

      const newHands: { lm: LM[]; side: string }[] = [];
      const newGesture = {
        left: gestureRef.current.left,
        right: gestureRef.current.right,
      };

      results.multiHandLandmarks.forEach((lm, i) => {
        const side =
          results.multiHandedness?.[i]?.label?.toLowerCase() ?? "right";
        newHands.push({ lm: lm as LM[], side });

        const g = classifyGesture(lm as LM[]);
        if (side === "left") newGesture.left = g;
        else newGesture.right = g;

        const det = side === "left" ? pinchL.current : pinchR.current;
        det.update(lm, now);
      });

      handsData.current = newHands;
      gestureRef.current = newGesture;
      setHandCount(newHands.length);
      setGesture({
        left: GESTURE_LABELS[newGesture.left] || newGesture.left,
        right: GESTURE_LABELS[newGesture.right] || newGesture.right,
      });
    });

    handsRef.current = hi;
    const video = videoRef.current!;

    function loop() {
      animRef.current = requestAnimationFrame(loop);
      drawFrame();
      if (video.readyState < 2 || sendingRef.current) return;
      sendingRef.current = true;
      hi.send({ image: video })
        .then(() => {
          sendingRef.current = false;
        })
        .catch(() => {
          sendingRef.current = false;
        });
    }
    loop();

    // Seed bubbles for bubbles mode
    for (let i = 0; i < 8; i++) setTimeout(() => spawnBubble(), i * 300);

    setStarted(true);
    setLoading(false);
    toast.success("Hand tracking active");
  }, [drawFrame, spawnBubble]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      handsRef.current?.close();
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
                    transition: "all 0.15s",
                    textTransform: "capitalize",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

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
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 1,
            height: 1,
          }}
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
                <span style={{ color: "#a78bfa", fontWeight: 600 }}>
                  Particles
                </span>{" "}
                — fingertip emission trail
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
                — paint with your index finger, wipe with open palm
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
                — pop them with your fingertips
              </p>
              <p
                style={{
                  color: "#52525b",
                  fontSize: 13,
                  lineHeight: 1.7,
                  margin: "0 0 32px",
                }}
              >
                <span style={{ color: "#6366f1", fontWeight: 600 }}>
                  Portal
                </span>{" "}
                — hands glow through the void
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
            }}
          />
        )}
      </div>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');`}</style>
    </div>
  );
}
