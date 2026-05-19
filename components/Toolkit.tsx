"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  GESTURE_LABELS,
  HAND_CONNECTIONS,
  FINGER_TIPS,
  useHandTracking,
  useGazeTracking,
  usePinchScroll,
  useDwellClick,
  useTwoHandGesture,
  useGazePinchClick,
  usePointerEmulation,
  GazeCursor,
  GazeCalibration,
  SpatialPanel,
  type GestureName,
  type PinchResult,
  type HandData,
} from "@/lib/openvision";
import { GlassHands } from "./toolkit/GlassHands";
import { SpatialPhotoWall } from "./toolkit/SpatialPhotoWall";
import { AirKeyboard } from "./toolkit/AirKeyboard";
import { DrawingCanvas } from "./toolkit/DrawingCanvas";
import { TunablePinch } from "./toolkit/TunablePinch";

interface PanelDef {
  id: string;
  x: number;
  y: number;
}

const SCROLL_FEED = [
  {
    title: "Gaze + pinch is the real Vision Pro pattern",
    body: "Dwell is fine for accessibility. The faster, more confident interaction is look-to-target plus a brief pinch to commit. useGazePinchClick implements exactly that.",
  },
  {
    title: "Two-handed zoom feels like sculpting",
    body: "The brain treats two-hand scale as a single physical action. Implementing it is just tracking the distance and angle between two pinch centers over time.",
  },
  {
    title: "MediaPipe runs in WebAssembly",
    body: "21 landmarks per hand, two hands, at 30fps in a tab. The inference loop must stay async or it stalls every other animation on the page.",
  },
  {
    title: "Glass hands as ambient feedback",
    body: "You don't need to see the camera feed to feel embodied. Frosted shapes over a dark background, depth-aware glints, and the brain fills in the rest.",
  },
  {
    title: "Permissions are private by default",
    body: "Every model runs on-device. No frame, no landmark, no gaze sample ever leaves the browser. Disabling the camera tab kills it instantly.",
  },
  {
    title: "Spatial UI without a headset",
    body: "OpenVision is the proof that spatial computing UX patterns work on a laptop. The headset adds depth perception; the interaction model works without it.",
  },
];

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 14,
        background: "rgba(0,0,0,0.55)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
        fontFamily:
          "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11.5,
        lineHeight: 1.65,
        color: "#d4d4d8",
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {children}
    </pre>
  );
}

function Stat({
  label,
  value,
  good,
}: {
  label: string;
  value: string | number;
  good?: boolean;
}) {
  return (
    <div
      style={{
        padding: "11px 13px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.035)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#71717a",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: good === false ? "#f87171" : good ? "#34d399" : "#fafafa",
          fontVariantNumeric: "tabular-nums",
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  code,
  children,
  fullWidth = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  code: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <section
      style={{
        padding: 22,
        borderRadius: 22,
        background: "rgba(255,255,255,0.025)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          display: "inline-block",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#a78bfa",
          background: "rgba(167,139,250,0.1)",
          border: "1px solid rgba(167,139,250,0.22)",
          padding: "3px 8px",
          borderRadius: 999,
          marginBottom: 10,
          fontFamily:
            "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        {eyebrow}
      </div>
      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: "#fafafa",
          letterSpacing: "-0.02em",
          margin: "0 0 6px",
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontSize: 13,
          color: "#a1a1aa",
          lineHeight: 1.6,
          margin: "0 0 14px",
        }}
      >
        {description}
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: fullWidth ? "1fr" : "1fr",
          gap: 12,
        }}
      >
        <CodeBlock>{code}</CodeBlock>
        <div>{children}</div>
      </div>
    </section>
  );
}

function Pill({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{
        padding: "6px 12px",
        borderRadius: 999,
        background: `${color}1f`,
        border: `1px solid ${color}55`,
        color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

export default function Toolkit() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // High-frequency refs (avoid per-frame re-renders)
  const handsRef = useRef<HandData[]>([]);
  const gesturesRef = useRef<{ left: GestureName; right: GestureName }>({
    left: "none",
    right: "none",
  });
  const pinchRef = useRef<{
    left: PinchResult | null;
    right: PinchResult | null;
  }>({ left: null, right: null });

  const [hands, setHands] = useState<HandData[]>([]);
  const [pinches, setPinches] = useState<{
    left: PinchResult | null;
    right: PinchResult | null;
  }>({ left: null, right: null });

  const [readout, setReadout] = useState({
    gestures: { left: "none" as GestureName, right: "none" as GestureName },
    pinchLeft: "idle",
    pinchRight: "idle",
  });

  const [panels, setPanels] = useState<PanelDef[]>([]);
  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emulatePointer, setEmulatePointer] = useState(false);
  const [emulatedClicks, setEmulatedClicks] = useState(0);
  const [gpClicks, setGpClicks] = useState(0);

  const pinchScroll = usePinchScroll({ target: scrollRef });
  const twoHand = useTwoHandGesture();
  const dwell = useDwellClick({
    dwellMs: 1200,
    onDwellClick: (el) => {
      if (el.id === "demo-dwell-button") toast.success("Dwell click fired");
    },
  });
  const gazePinch = useGazePinchClick({
    focused: dwell.focused,
    // Disable when pointer emulation is on; otherwise both fire and the same
    // button gets clicked twice on a single pinch release.
    enabled: !emulatePointer,
    onClick: (el) => {
      if (el.id === "demo-gp-button") {
        setGpClicks((n) => n + 1);
        toast.success("Look + pinch click fired");
      }
    },
  });
  const pointer = usePointerEmulation({
    enabled: emulatePointer,
    onClick: () => setEmulatedClicks((n) => n + 1),
  });

  const handTracking = useHandTracking({
    videoRef,
    onFrame: (f) => {
      handsRef.current = f.hands;
      gesturesRef.current = f.gestures;
      pinchRef.current = f.pinches;
      pinchScroll.apply(f.pinches.left);
      pinchScroll.apply(f.pinches.right);
      twoHand.update(f.pinches);
      gazePinch.feed(f.pinches);
      pointer.feedPinch(f.pinches);
    },
  });

  const gazeTracking = useGazeTracking({
    onSample: (s) => {
      dwell.feed(s);
      pointer.setGaze(s);
    },
  });

  // Mirror refs to state at low frequency (every 90ms)
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      setHands([...handsRef.current]);
      setPinches({ ...pinchRef.current });
      setReadout({
        gestures: { ...gesturesRef.current },
        pinchLeft: pinchRef.current.left?.state ?? "idle",
        pinchRight: pinchRef.current.right?.state ?? "idle",
      });
    }, 90);
    return () => window.clearInterval(id);
  }, [started]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (starting || started) return;
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await handTracking.start();
      try {
        await gazeTracking.start();
      } catch (e) {
        // WebGazer opens its own camera stream. Some browsers (Safari) will
        // re-prompt or fail when a second getUserMedia is requested in the
        // same tab. Hand tools still work; eye tools just stay off.
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(
          `Gaze tracking unavailable (${msg.slice(0, 60)}). Hand tools still active.`,
        );
        console.warn("[Toolkit] gaze start failed:", e);
      }
      setStarted(true);
      toast.success("All tools active");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Camera permission needed");
    } finally {
      setStarting(false);
    }
  }, [handTracking, gazeTracking, started, starting]);

  const spawnPanel = useCallback(() => {
    const id = `panel-${Date.now()}`;
    setPanels((p) => [
      ...p,
      {
        id,
        x: 80 + p.length * 40,
        y: 240 + p.length * 30,
      },
    ]);
  }, []);

  const closePanel = useCallback((id: string) => {
    setPanels((p) => p.filter((x) => x.id !== id));
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at top, rgba(99,102,241,0.18), transparent 55%), radial-gradient(ellipse at bottom right, rgba(168,85,247,0.08), transparent 50%), #050507",
        color: "white",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{
          position: "absolute",
          opacity: 0,
          pointerEvents: "none",
          width: 1,
          height: 1,
        }}
      />

      {gazeTracking.started && (
        <GazeCursor
          x={gazeTracking.gaze.x}
          y={gazeTracking.gaze.y}
          dwellProgress={dwell.dwellProgress}
        />
      )}

      <GazeCalibration
        active={calibrating}
        onRecord={(x, y) => gazeTracking.record(x, y)}
        onComplete={() => {
          setCalibrating(false);
          toast.success("Calibration complete");
        }}
        onCancel={() => setCalibrating(false)}
      />

      {panels.map((p) => (
        <SpatialPanel
          key={p.id}
          id={p.id}
          title="Spatial panel"
          initialX={p.x}
          initialY={p.y}
          width={300}
          onClose={() => closePanel(p.id)}
          gazeFocused={dwell.focused?.id === p.id}
        >
          <p
            style={{
              fontSize: 13,
              color: "#a1a1aa",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            Drag the header. Look at the panel for the focus ring. Hit X to
            close.
          </p>
        </SpatialPanel>
      ))}

      <header
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          backdropFilter: "blur(12px)",
          background: "rgba(5,5,7,0.7)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.4), rgba(168,85,247,0.25))",
              border: "1px solid rgba(99,102,241,0.4)",
              boxShadow: "0 0 18px rgba(99,102,241,0.35)",
            }}
          />
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            OpenVision Toolkit
          </span>
        </div>
        <nav style={{ display: "flex", gap: 8, fontSize: 12 }}>
          {started && gazeTracking.started && (
            <button
              onClick={() => setCalibrating(true)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.2))",
                border: "1px solid rgba(99,102,241,0.35)",
                color: "#c4b5fd",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Calibrate gaze
            </button>
          )}
          <a href="/hands" style={navLinkStyle}>
            HandsWeb
          </a>
          <a href="/vision" style={navLinkStyle}>
            VisionWeb
          </a>
          <a
            href="https://github.com/calebnewtonusc/OpenVision"
            target="_blank"
            rel="noreferrer"
            style={navLinkStyle}
          >
            GitHub
          </a>
        </nav>
      </header>

      <main
        style={{
          maxWidth: 1040,
          margin: "0 auto",
          padding: "56px 20px 96px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#818cf8",
              background: "rgba(99,102,241,0.12)",
              border: "1px solid rgba(99,102,241,0.22)",
              padding: "4px 10px",
              borderRadius: 999,
              marginBottom: 18,
              fontFamily:
                "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          >
            Spatial primitives · live on one camera
          </div>
          <h1
            style={{
              fontSize: 52,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
              margin: "0 0 14px",
              background: "linear-gradient(180deg, #ffffff 0%, #9ca3af 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Every spatial primitive,
            <br />
            running on one page.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: "#a1a1aa",
              maxWidth: 620,
              margin: "0 auto 28px",
              lineHeight: 1.65,
            }}
          >
            One camera, eleven tools, three mini-apps. Frosted glass hands,
            two-handed zoom, gaze plus pinch, dwell to click, pinch to scroll,
            air keyboard, drawing canvas, spatial photo wall. Every section
            shows the import and a live demo.
          </p>
          {!started ? (
            <button
              onClick={handleStart}
              disabled={starting}
              style={{
                padding: "15px 36px",
                borderRadius: 14,
                border: "none",
                background: starting
                  ? "rgba(99,102,241,0.3)"
                  : "linear-gradient(135deg, #6366f1, #a855f7)",
                boxShadow: starting
                  ? "none"
                  : "0 12px 40px rgba(99,102,241,0.45)",
                color: "white",
                fontWeight: 700,
                fontSize: 15,
                letterSpacing: "-0.01em",
                cursor: starting ? "not-allowed" : "pointer",
              }}
            >
              {starting ? "Starting camera…" : "Start camera"}
            </button>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 16px",
                borderRadius: 999,
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.25)",
                color: "#34d399",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#34d399",
                  boxShadow: "0 0 12px #34d399",
                }}
              />
              Live · {handTracking.fps} fps · {handTracking.handCount} hand(s)
              {gazeTracking.started && (
                <span style={{ color: "#a1a1aa" }}>
                  · gaze {Math.round(gazeTracking.gaze.x)},{" "}
                  {Math.round(gazeTracking.gaze.y)}
                </span>
              )}
            </div>
          )}
          {error && (
            <p style={{ marginTop: 14, fontSize: 12, color: "#f87171" }}>
              {error}
            </p>
          )}
        </div>

        {started && (
          <>
            <div
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 32px 80px rgba(99,102,241,0.18)",
              }}
            >
              <GlassHands hands={hands} pinches={pinches} height={460} />
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  top: 16,
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#c4b5fd",
                  background: "rgba(167,139,250,0.12)",
                  border: "1px solid rgba(167,139,250,0.3)",
                  backdropFilter: "blur(10px)",
                }}
              >
                Your hands · live
              </div>
              <div
                style={{
                  position: "absolute",
                  right: 16,
                  top: 16,
                  display: "flex",
                  gap: 6,
                }}
              >
                <Pill
                  color="#a78bfa"
                  label={`L · ${GESTURE_LABELS[readout.gestures.left] || "—"}`}
                />
                <Pill
                  color="#34d399"
                  label={`R · ${GESTURE_LABELS[readout.gestures.right] || "—"}`}
                />
              </div>
              {twoHand.state.active && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 16,
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: "rgba(251,191,36,0.14)",
                    border: "1px solid rgba(251,191,36,0.4)",
                    color: "#fbbf24",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily:
                      "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  TWO-HAND · scale {twoHand.state.scale.toFixed(2)}x ·{" "}
                  {((twoHand.state.rotation * 180) / Math.PI).toFixed(0)}°
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 10,
              }}
            >
              <Stat
                label="FPS"
                value={handTracking.fps}
                good={handTracking.fps > 20}
              />
              <Stat label="Hands" value={handTracking.handCount} />
              <Stat label="Left pinch" value={readout.pinchLeft} />
              <Stat label="Right pinch" value={readout.pinchRight} />
              <Stat
                label="Gaze"
                value={
                  gazeTracking.started
                    ? `${Math.round(gazeTracking.gaze.x)},${Math.round(gazeTracking.gaze.y)}`
                    : "off"
                }
                good={gazeTracking.started}
              />
              <Stat
                label="Dwell"
                value={`${Math.round(dwell.dwellProgress * 100)}%`}
              />
              <Stat
                label="Two-hand"
                value={
                  twoHand.state.active
                    ? `${twoHand.state.scale.toFixed(2)}x`
                    : "off"
                }
                good={twoHand.state.active}
              />
              <Stat label="GP clicks" value={gpClicks} />
            </div>

            <Section
              eyebrow="react / useTwoHandGesture"
              title="Two-handed zoom + rotate"
              description="Pinch with both hands at once, then move them apart or together to scale; rotate the line between them to rotate. Photos respond live: single pinch drags one, two-hand pinch transforms the topmost."
              code={`const twoHand = useTwoHandGesture();

useHandTracking({
  videoRef,
  onFrame: (f) => twoHand.update(f.pinches),
});

// twoHand.state.active, .scale, .rotation, .scaleDelta`}
            >
              <SpatialPhotoWall pinches={pinches} twoHand={twoHand.state} />
            </Section>

            <Section
              eyebrow="react / useGazePinchClick"
              title="Look + pinch (the Vision Pro pattern)"
              description="Faster than dwell. Look at any target to focus it, briefly close thumb + index to commit. No waiting. The button below counts your clicks."
              code={`const gazePinch = useGazePinchClick({
  focused: dwell.focused,
  onClick: (el) => console.log("clicked", el.id),
});

useHandTracking({
  videoRef,
  onFrame: (f) => gazePinch.feed(f.pinches),
});`}
            >
              <button
                id="demo-gp-button"
                data-gaze-target="true"
                onClick={() => {
                  setGpClicks((n) => n + 1);
                }}
                style={{
                  width: "100%",
                  padding: "20px 24px",
                  borderRadius: 14,
                  border: "1px solid rgba(99,102,241,0.4)",
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))",
                  color: "#fafafa",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                  letterSpacing: "-0.01em",
                }}
              >
                Look at me, then pinch · clicked {gpClicks} times
              </button>
            </Section>

            <Section
              eyebrow="react / usePointerEmulation"
              title="Make any button gaze + pinch aware"
              description="Dispatches synthetic pointer + click events at the gaze position when you pinch. Existing UI code keeps working — no rewrite needed. Toggle below."
              code={`const emul = usePointerEmulation({ enabled: true });

useGazeTracking({ onSample: emul.setGaze });
useHandTracking({ videoRef, onFrame: (f) => emul.feedPinch(f.pinches) });

// every <button>, <a>, etc. now responds to gaze + pinch`}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setEmulatePointer((v) => !v)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: `1px solid ${emulatePointer ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.08)"}`,
                    background: emulatePointer
                      ? "rgba(52,211,153,0.14)"
                      : "rgba(255,255,255,0.04)",
                    color: emulatePointer ? "#34d399" : "#fafafa",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {emulatePointer ? "Emulation ON" : "Enable pointer emulation"}
                </button>
                {(["Alpha", "Beta", "Gamma"] as const).map((label) => (
                  <button
                    key={label}
                    onClick={() => toast.success(`${label} clicked`)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.04)",
                      color: "#fafafa",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                ))}
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "#a1a1aa",
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  Emulated clicks: {emulatedClicks}
                </div>
              </div>
            </Section>

            <Section
              eyebrow="core / pinch.ts (tunable)"
              title="PinchDetector with live thresholds"
              description="The state machine wired to live sliders. Move the enter/exit ratios while pinching — watch the state pill react. Hysteresis is what keeps the gesture from flickering."
              code={`const det = new PinchDetector({ enterRatio, exitRatio, holdMs });
const r = det.update(landmarks);
// r.state ∈ idle | pinching | holding | dragging | released`}
            >
              <TunablePinch hands={hands} />
            </Section>

            <Section
              eyebrow="react / usePinchScroll"
              title="Pinch + drag to scroll a real feed"
              description="Pinch your thumb and index together, then move your hand up or down. The card scrolls. Trackpad still works."
              code={`const scrollRef = useRef<HTMLDivElement>(null);
const pinchScroll = usePinchScroll({ target: scrollRef });

useHandTracking({
  videoRef,
  onFrame: (f) => {
    pinchScroll.apply(f.pinches.left);
    pinchScroll.apply(f.pinches.right);
  },
});`}
            >
              <div
                ref={scrollRef}
                style={{
                  height: 280,
                  overflowY: "auto",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(0,0,0,0.4)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {SCROLL_FEED.map((item) => (
                  <div
                    key={item.title}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <h4
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "#fafafa",
                        margin: "0 0 4px",
                      }}
                    >
                      {item.title}
                    </h4>
                    <p
                      style={{
                        fontSize: 12,
                        color: "#a1a1aa",
                        lineHeight: 1.55,
                        margin: 0,
                      }}
                    >
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              eyebrow="mini-app · DrawingCanvas"
              title="Paint with your index finger"
              description="Point with index, the stroke follows. Z-depth from the landmarks controls the brush width: bring your finger closer to the camera, the line grows. Show your open palm to clear."
              code={`// hands → DrawingCanvas. Inside, the component watches for
// the point gesture and uses indexTip.z to drive stroke width.`}
            >
              <DrawingCanvas hands={hands} />
            </Section>

            <Section
              eyebrow="mini-app · AirKeyboard"
              title="Air keyboard powered by gaze + pinch"
              description="Look at a key, then pinch. The key tags itself data-gaze-target so the focus engine picks it up, and useGazePinchClick fires the click on commit."
              code={`// Each key is a <button data-gaze-target onClick={...}>.
// useDwellClick or useGazePinchClick wires the rest.`}
            >
              <AirKeyboard focused={dwell.focused} />
            </Section>

            <Section
              eyebrow="react / useGazeTracking + GazeCursor + GazeCalibration"
              title="Eye tracking, calibration, and the floating cursor"
              description="The cursor floating on this page is live. Click 'Calibrate gaze' in the header to run a 9-point training pass — accuracy jumps after."
              code={`const gaze = useGazeTracking({ onSample: dwell.feed });

<GazeCursor x={gaze.gaze.x} y={gaze.gaze.y} dwellProgress={dwell.dwellProgress} />
<GazeCalibration active={calibrating} onRecord={gaze.record} onComplete={...} />`}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setCalibrating(true)}
                  disabled={!gazeTracking.started}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: "1px solid rgba(99,102,241,0.35)",
                    background:
                      "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))",
                    color: gazeTracking.started ? "#c4b5fd" : "#52525b",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: gazeTracking.started ? "pointer" : "not-allowed",
                  }}
                >
                  Start 9-point calibration
                </button>
                <div
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "#a1a1aa",
                    fontSize: 13,
                  }}
                >
                  {gazeTracking.started
                    ? "Gaze active. Look around — the cursor follows."
                    : "Gaze tracking did not start. Allow the second camera prompt or skip."}
                </div>
              </div>
            </Section>

            <Section
              eyebrow="react / useDwellClick"
              title="Stare to click"
              description="Look at the button. After 1.2 seconds the ring fills and the click fires. The focus engine handles small jitter through hysteresis."
              code={`const dwell = useDwellClick({
  dwellMs: 1200,
  onDwellClick: (el) => console.log("clicked", el.id),
});

useGazeTracking({ onSample: dwell.feed });`}
            >
              <button
                id="demo-dwell-button"
                data-gaze-target="true"
                onClick={() => toast.success("Clicked (dwell)")}
                style={{
                  width: "100%",
                  padding: "18px 24px",
                  borderRadius: 14,
                  border: "1px solid rgba(167,139,250,0.35)",
                  background: "rgba(167,139,250,0.12)",
                  color: "#c4b5fd",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  textAlign: "center",
                  letterSpacing: "-0.01em",
                }}
              >
                Stare at me for 1.2 seconds
              </button>
            </Section>

            <Section
              eyebrow="react / SpatialPanel"
              title="Floating glass panels with gaze focus"
              description="Draggable, closeable, glass-styled. Already tagged data-gaze-target so dwell-click and look + pinch work without extra wiring."
              code={`<SpatialPanel id="x" title="Settings" onClose={...} gazeFocused={focused?.id === "x"}>
  <div>panel body</div>
</SpatialPanel>`}
            >
              <button
                onClick={spawnPanel}
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#fafafa",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Spawn a panel
              </button>
              {panels.length > 0 && (
                <p style={{ marginTop: 10, fontSize: 12, color: "#71717a" }}>
                  {panels.length} panel(s) open. Drag them. Look at one to see
                  the focus ring.
                </p>
              )}
            </Section>

            <Section
              eyebrow="core / skeleton.ts + gestures.ts"
              title="Skeleton constants and gesture classifier"
              description="The two zero-dep pieces every consumer touches. HAND_CONNECTIONS is the bone graph (21 pairs). FINGER_TIPS is the tip indices. classifyGesture returns one of nine names."
              code={`import { HAND_CONNECTIONS, FINGER_TIPS, classifyGesture, GESTURE_LABELS } from "@/lib/openvision";

const g = classifyGesture(landmarks);   // "pinch" | "open" | "point" | ...
const label = GESTURE_LABELS[g];        // "Pinch", "Open", ...`}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#a1a1aa",
                  padding: 14,
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontFamily:
                    "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
                  lineHeight: 1.7,
                }}
              >
                HAND_CONNECTIONS.length = {HAND_CONNECTIONS.length}
                <br />
                FINGER_TIPS = [{FINGER_TIPS.join(", ")}]
                <br />
                Current gestures: left={" "}
                <span style={{ color: "#a78bfa" }}>
                  {readout.gestures.left}
                </span>{" "}
                · right={" "}
                <span style={{ color: "#34d399" }}>
                  {readout.gestures.right}
                </span>
              </div>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

const navLinkStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#a1a1aa",
  textDecoration: "none",
  fontWeight: 500,
};
