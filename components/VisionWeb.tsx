"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  Eye,
  Hand,
  Settings,
  Bug,
  Plus,
  X,
  BookOpen,
  LayoutGrid,
} from "lucide-react";
import {
  SpatialPanel,
  useHandTracking,
  useGazeTracking,
  useDwellClick,
} from "@/lib/openvision";
import { toast } from "sonner";

interface GazePoint {
  x: number;
  y: number;
}
interface PanelDef {
  id: string;
  title: string;
  x: number;
  y: number;
  content: "welcome" | "gestures" | "focus" | "about";
}

// ── Scroll helper: find nearest scrollable ancestor ──────────────────────
function getScrollTarget(el: Element | null): Element | Window {
  let cur = el;
  while (cur && cur !== document.documentElement) {
    const s = window.getComputedStyle(cur);
    if (
      (s.overflowY === "scroll" || s.overflowY === "auto") &&
      cur.scrollHeight > cur.clientHeight
    )
      return cur;
    cur = cur.parentElement;
  }
  return window;
}

// ── Panel content components ───────────────────────────────────────────────
function WelcomeContent() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400 leading-relaxed">
        VisionWeb is a spatial interface controlled by your eyes and hands. Look
        at things to focus them. Pinch to select. Pinch and drag to scroll.
      </p>
      <div className="space-y-2">
        {[
          ["Look", "Gaze cursor follows your eyes"],
          ["Pinch", "Thumb + index finger = click"],
          ["Pinch + drag", "Move hand up/down to scroll"],
          ["Dwell", "Stare 1.2s at any target to click"],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 items-start">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
            <div>
              <span className="text-xs font-semibold text-zinc-200">{k}</span>
              <span className="text-xs text-zinc-500">: {v}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GestureContent() {
  const rows: [string, string, string][] = [
    ["Pinch", "Index + thumb close", "Click / select"],
    ["Pinch + drag up", "Pinch, move hand up", "Scroll down"],
    ["Pinch + drag down", "Pinch, move hand down", "Scroll up"],
    ["Hold pinch", "Hold 220ms", "Long press"],
    ["Two-hand pinch", "Both hands", "Zoom + rotate"],
  ];
  return (
    <div className="space-y-2">
      {rows.map(([name, trigger, action]) => (
        <div
          key={name}
          className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0"
        >
          <div>
            <div className="text-xs font-semibold text-zinc-200">{name}</div>
            <div className="text-xs text-zinc-500">{trigger}</div>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {action}
          </span>
        </div>
      ))}
    </div>
  );
}

function FocusContent({
  fps,
  gazeActive,
  handsActive,
}: {
  fps: number;
  gazeActive: boolean;
  handsActive: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["Gaze", gazeActive ? "Active" : "Off", gazeActive],
            ["Hands", handsActive ? "Active" : "Off", handsActive],
            ["FPS", String(fps), fps > 20],
            ["Dwell", "1200ms", true],
          ] as [string, string, boolean][]
        ).map(([label, val, ok]) => (
          <div
            key={label}
            className="rounded-xl p-3 bg-white/[0.04] border border-white/[0.06]"
          >
            <div className="text-[10px] text-zinc-500 mb-1">{label}</div>
            <div
              className={`text-sm font-semibold ${ok ? "text-emerald-400" : "text-zinc-500"}`}
            >
              {val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AboutContent() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-400 leading-relaxed">
        VisionWeb is a Vision Pro-inspired spatial interface running entirely in
        your browser. No native app, no headset required.
      </p>
      <div className="rounded-xl p-3 bg-indigo-500/[0.08] border border-indigo-500/20">
        <div className="text-xs text-indigo-300 leading-relaxed">
          Everything runs locally on-device. Your camera feed never leaves your
          browser.
        </div>
      </div>
      <div className="text-[10px] text-zinc-600">
        Powered by WebGazer.js (Brown University) and MediaPipe Tasks Vision
        (Google).
      </div>
    </div>
  );
}

const CALIB_POSITIONS = (() => {
  const xs = ["10%", "50%", "90%"];
  const ys = ["15%", "50%", "85%"];
  return ys.flatMap((y) => xs.map((x) => ({ x, y })));
})();

const CALIB_CLICKS_NEEDED = 5;

// ── Main component ─────────────────────────────────────────────────────────
export default function VisionWeb() {
  const [started, setStarted] = useState(false);
  const [permState, setPermState] = useState<
    "unknown" | "prompt" | "granted" | "denied"
  >("unknown");
  const [ready, setReady] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panels, setPanels] = useState<PanelDef[]>([]);
  const [dwellMs, setDwellMs] = useState(1200);
  const [cameraError, setCameraError] = useState(false);
  const [cameraErrorDetail, setCameraErrorDetail] = useState("");
  const [calibrating, setCalibrating] = useState(false);
  const [calibDots, setCalibDots] = useState<number[]>(Array(9).fill(0));
  const calibDotsRef = useRef<number[]>(Array(9).fill(0));

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const webgazerReadyRef = useRef(false);

  // ── Lib hooks ────────────────────────────────────────────────────────────
  const dwell = useDwellClick({
    dwellMs,
    selector: "[data-gaze-target]",
    focusClass: "gaze-focus",
  });

  const gaze = useGazeTracking({
    onSample: (s) => {
      dwell.feed(s);
    },
  });

  const hands = useHandTracking({
    videoRef,
    onFrame: (f) => {
      // Smart pinch scroll: scroll whatever scrollable lives under the gaze
      // (or the pinch center if no gaze). VisionWeb is multi-panel so we don't
      // bind a single target like the toolkit demo does.
      const apply = (side: "left" | "right"): void => {
        const r = f.pinches[side];
        if (!r || r.state !== "dragging" || !r.center) return;
        const sx = (1 - r.center.x) * window.innerWidth;
        const sy = r.center.y * window.innerHeight;
        const el = document.elementFromPoint(sx, sy);
        const raw = -r.delta.y * 700;
        const amt = Math.sign(raw) * Math.min(Math.abs(raw), 220);
        const target = getScrollTarget(el);
        if (target === window) {
          window.scrollBy({ top: amt, behavior: "instant" });
        } else {
          (target as Element).scrollBy({ top: amt, behavior: "instant" });
        }
      };
      apply("left");
      apply("right");

      // Pinch-released → click whatever is under the pinch center
      const click = (side: "left" | "right"): void => {
        const r = f.pinches[side];
        if (r?.changed && r.state === "released" && r.center) {
          const sx = (1 - r.center.x) * window.innerWidth;
          const sy = r.center.y * window.innerHeight;
          const el = document.elementFromPoint(sx, sy);
          if (el) (el as HTMLElement).click();
        }
      };
      click("left");
      click("right");
    },
  });

  // Calibration viewport tracking (so we can scale predictions later)
  const calibViewportRef = useRef({ w: 0, h: 0 });

  // ── Permission state on mount ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const navWithPermissions = navigator as unknown as {
      permissions?: {
        query?: (q: { name: string }) => Promise<{
          state: PermissionState;
          onchange: (() => void) | null;
        }>;
      };
    };
    const q = navWithPermissions.permissions?.query;
    if (!q) {
      setPermState("prompt");
      return;
    }
    q({ name: "camera" })
      .then((p) => {
        if (cancelled) return;
        setPermState(
          p.state === "granted"
            ? "granted"
            : p.state === "denied"
              ? "denied"
              : "prompt",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setPermState("prompt");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // ── Camera start ─────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarted(true);

    if (!navigator?.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      setCameraError(true);
      setCameraErrorDetail(
        "NotSupportedError: mediaDevices.getUserMedia unavailable. Are you on HTTPS?",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPermState("granted");
      setReady(true);
      setCalibrating(true);
    } catch (err) {
      startingRef.current = false;
      const e = err as { name?: string; message?: string };
      setCameraError(true);
      setCameraErrorDetail(`${e.name ?? "Error"}: ${e.message ?? String(err)}`);
      if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
        setPermState("denied");
      }
    }
  }, []);

  // ── Hand tracking + gaze: start after camera is ready ─────────────────────
  useEffect(() => {
    if (!ready) return;
    hands.start().catch((err) => {
      toast.error(`Hand tracking failed: ${err.message}`);
    });
  }, [ready, hands]);

  useEffect(() => {
    if (!ready) return;
    if (!webgazerReadyRef.current) return;
    gaze.start().catch((err) => {
      toast.error(`Eye tracking failed: ${err.message}`);
    });
  }, [ready, gaze]);

  // Sync calibDots ref
  useEffect(() => {
    calibDotsRef.current = calibDots;
  }, [calibDots]);

  const handleCalibDot = useCallback(
    (idx: number, e: React.MouseEvent<HTMLButtonElement>) => {
      const next = [...calibDotsRef.current];
      if (next[idx] >= CALIB_CLICKS_NEEDED) return;
      next[idx] = Math.min(CALIB_CLICKS_NEEDED, next[idx] + 1);
      setCalibDots(next);
      gaze.record(e.clientX, e.clientY);
      calibViewportRef.current = {
        w: window.innerWidth,
        h: window.innerHeight,
      };
      if (next.every((c) => c >= CALIB_CLICKS_NEEDED)) {
        setTimeout(() => {
          setCalibrating(false);
          toast.success("Calibration complete");
        }, 400);
      }
    },
    [gaze],
  );

  // ── Panels ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setPanels([
      {
        id: "welcome",
        title: "Welcome to VisionWeb",
        x: 80,
        y: 100,
        content: "welcome",
      },
    ]);
  }, []);

  const closePanel = useCallback((id: string) => {
    setPanels((p) => p.filter((panel) => panel.id !== id));
  }, []);

  const addPanel = useCallback(
    (content: PanelDef["content"], title: string) => {
      const id = `${content}-${Date.now()}`;
      setPanels((p) => [
        ...p,
        {
          id,
          title,
          x: 80 + p.length * 40,
          y: 100 + p.length * 30,
          content,
        },
      ]);
    },
    [],
  );

  const renderPanelContent = (def: PanelDef) => {
    switch (def.content) {
      case "welcome":
        return <WelcomeContent />;
      case "gestures":
        return <GestureContent />;
      case "focus":
        return (
          <FocusContent
            fps={hands.fps}
            gazeActive={gaze.started}
            handsActive={hands.started}
          />
        );
      case "about":
        return <AboutContent />;
    }
  };

  type ToolbarItem = [
    React.ComponentType<{ size: number; className?: string }>,
    string,
    boolean,
    (() => void) | null,
  ];
  const toolbarItems: ToolbarItem[] = [
    [Eye, "Gaze", gaze.started, null],
    [Hand, "Hands", hands.started, null],
    [Plus, "New Panel", true, () => addPanel("about", "About VisionWeb")],
    [
      LayoutGrid,
      "Gestures",
      true,
      () => addPanel("gestures", "Gesture Reference"),
    ],
    [BookOpen, "Status", true, () => addPanel("focus", "System Status")],
    [Settings, "Settings", true, () => setSettingsOpen((s) => !s)],
    [Bug, "Debug", true, () => setDebugOpen((s) => !s)],
  ];

  return (
    <>
      {/* Load WebGazer ONLY after camera is granted. It auto-starts on load and
          would call getUserMedia before the user clicks Start otherwise */}
      {ready && (
        <Script
          src="https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.js"
          strategy="afterInteractive"
          onReady={() => {
            webgazerReadyRef.current = true;
            gaze.start().catch((err) => {
              toast.error(`Eye tracking failed: ${err.message}`);
            });
          }}
        />
      )}

      {/* Camera video: hidden normally, shown during calibration */}
      <div
        style={{
          position: "fixed",
          bottom: calibrating ? 16 : 0,
          right: calibrating ? 16 : 0,
          zIndex: calibrating ? 9500 : -10,
          borderRadius: calibrating ? 16 : 0,
          overflow: "hidden",
          border: calibrating ? "2px solid rgba(99,102,241,0.5)" : "none",
          boxShadow: calibrating ? "0 8px 32px rgba(0,0,0,0.7)" : "none",
          transition: "opacity 0.3s ease",
          opacity: calibrating ? 1 : 0,
          pointerEvents: "none",
        }}
      >
        <video
          ref={videoRef}
          id="camera-video"
          autoPlay
          playsInline
          muted
          style={{
            display: "block",
            width: 200,
            height: 150,
            objectFit: "cover",
            transform: "scaleX(-1)",
          }}
        />
        {calibrating && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <svg
              width={200}
              height={150}
              viewBox="0 0 200 150"
              style={{ position: "absolute", inset: 0 }}
            >
              <ellipse
                cx={100}
                cy={70}
                rx={42}
                ry={54}
                fill="none"
                stroke="rgba(99,102,241,0.7)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            </svg>
            <div
              style={{
                position: "absolute",
                bottom: 6,
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: 9,
                fontFamily: "Inter, sans-serif",
                fontWeight: 600,
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "0.04em",
              }}
            >
              ALIGN FACE TO OVAL
            </div>
          </div>
        )}
      </div>

      {/* Splash */}
      {!started && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(99,102,241,0.18), transparent 65%), #09090b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "Inter, sans-serif",
          }}
        >
          <div
            style={{
              textAlign: "center",
              maxWidth: 360,
              padding: "0 24px",
              width: "100%",
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 28,
                margin: "0 auto 32px",
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Eye size={36} color="#818cf8" />
            </div>
            <h1
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: "#fff",
                margin: "0 0 8px",
                letterSpacing: "-0.02em",
              }}
            >
              VisionWeb
            </h1>
            <p
              style={{
                fontSize: 14,
                color: "#a1a1aa",
                lineHeight: 1.6,
                margin: "0 0 40px",
              }}
            >
              Spatial computing in your browser. Controlled by your eyes and
              hands. No headset required.
            </p>

            {permState === "denied" ? (
              <div>
                <div
                  style={{
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    textAlign: "left",
                  }}
                >
                  <p
                    style={{
                      color: "#f87171",
                      fontSize: 12,
                      fontWeight: 600,
                      margin: "0 0 6px",
                    }}
                  >
                    Camera access blocked
                  </p>
                  <p
                    style={{
                      color: "#a1a1aa",
                      fontSize: 12,
                      margin: "0 0 8px",
                    }}
                  >
                    To fix: click the camera icon in your address bar, set to
                    Allow, then reload.
                  </p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: 16,
                    background: "#27272a",
                    border: "1px solid #3f3f46",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Reload after allowing camera
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={handleStart}
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    borderRadius: 16,
                    border: "none",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Start VisionWeb
                </button>
                <p style={{ marginTop: 16, fontSize: 11, color: "#52525b" }}>
                  Camera access required. Your feed never leaves your browser.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Camera error state */}
      {cameraError && (
        <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-zinc-950">
          <div className="text-center max-w-sm px-6">
            <div className="w-14 h-14 rounded-[18px] bg-red-500/10 flex items-center justify-center mx-auto mb-4">
              <Eye size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Camera blocked
            </h2>
            <p className="text-zinc-400 text-sm leading-relaxed mb-3">
              VisionWeb needs webcam access. Allow camera in your browser
              settings and reload.
            </p>
            {cameraErrorDetail && (
              <p className="text-red-400/70 text-xs font-mono mb-5 px-3 py-2 bg-red-500/5 rounded-lg border border-red-500/10 break-all">
                {cameraErrorDetail}
              </p>
            )}
            <p className="text-zinc-500 text-xs mb-5 leading-relaxed">
              If you previously denied access: click the camera icon in your
              browser address bar and allow, then reload.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-2.5 rounded-xl transition-all duration-200 cursor-pointer"
            >
              Reload
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {started && !ready && !cameraError && (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-zinc-950">
          <div className="text-center">
            <div className="w-14 h-14 rounded-[18px] bg-indigo-500/10 flex items-center justify-center mx-auto mb-4 animate-pulse">
              <Eye size={28} className="text-indigo-400" />
            </div>
            <p className="text-zinc-400 text-sm">Requesting camera access…</p>
          </div>
        </div>
      )}

      {/* Calibration */}
      {calibrating &&
        ready &&
        (() => {
          const doneCount = calibDots.filter(
            (n) => n >= CALIB_CLICKS_NEEDED,
          ).length;
          const activeIdx = calibDots.findIndex((n) => n < CALIB_CLICKS_NEEDED);
          const circumference = 2 * Math.PI * 18;
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9000,
                background: "#09090b",
                fontFamily: "Inter, sans-serif",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  textAlign: "center",
                  padding: "32px 24px 0",
                  pointerEvents: "none",
                }}
              >
                <p
                  style={{
                    color: "#fff",
                    fontSize: 17,
                    fontWeight: 700,
                    margin: "0 0 8px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Eye Tracking Calibration
                </p>
                <p
                  style={{
                    color: "#a1a1aa",
                    fontSize: 13,
                    margin: "0 0 4px",
                    lineHeight: 1.5,
                  }}
                >
                  Look at the dot. Hold perfectly still. Click it{" "}
                  {CALIB_CLICKS_NEEDED} times.
                </p>
                <p
                  style={{
                    color: "#52525b",
                    fontSize: 11,
                    margin: "0 0 16px",
                    lineHeight: 1.5,
                  }}
                >
                  Check the preview in the bottom-right corner.
                </p>
                <div
                  style={{ display: "flex", gap: 6, justifyContent: "center" }}
                >
                  {Array.from({ length: CALIB_POSITIONS.length }).map(
                    (_, i) => (
                      <div
                        key={`calib-progress-${i}`}
                        style={{
                          width: 24,
                          height: 4,
                          borderRadius: 2,
                          background:
                            calibDots[i] >= CALIB_CLICKS_NEEDED
                              ? "#34d399"
                              : i === activeIdx
                                ? "#6366f1"
                                : "rgba(255,255,255,0.1)",
                          transition: "background 0.3s ease",
                        }}
                      />
                    ),
                  )}
                </div>
                <p style={{ color: "#52525b", fontSize: 11, marginTop: 10 }}>
                  {doneCount === 0
                    ? "Start with the glowing dot"
                    : doneCount < CALIB_POSITIONS.length
                      ? `${CALIB_POSITIONS.length - doneCount} dots remaining`
                      : "All done!"}
                </p>
              </div>

              {CALIB_POSITIONS.map((pos, idx) => {
                const isDone = calibDots[idx] >= CALIB_CLICKS_NEEDED;
                const isActive = idx === activeIdx;
                if (!isDone && !isActive) return null;
                const clicks = calibDots[idx];
                const fillFraction = clicks / CALIB_CLICKS_NEEDED;
                const dashOffset = circumference * (1 - fillFraction);
                return (
                  <button
                    key={`calib-dot-${pos.x}-${pos.y}`}
                    onClick={(e) =>
                      isActive ? handleCalibDot(idx, e) : undefined
                    }
                    style={{
                      position: "absolute",
                      left: pos.x,
                      top: pos.y,
                      transform: "translate(-50%, -50%)",
                      width: isDone ? 24 : 48,
                      height: isDone ? 24 : 48,
                      borderRadius: "50%",
                      border: "none",
                      background: "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: isActive ? "pointer" : "default",
                      transition: "opacity 0.25s ease, transform 0.25s ease",
                      padding: 0,
                    }}
                  >
                    {isDone ? (
                      <svg width={24} height={24} viewBox="0 0 24 24">
                        <circle
                          cx={12}
                          cy={12}
                          r={10}
                          fill="rgba(52,211,153,0.8)"
                        />
                        <polyline
                          points="7,12 10,15 17,9"
                          fill="none"
                          stroke="#fff"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg
                        width={48}
                        height={48}
                        viewBox="0 0 48 48"
                        style={{
                          animation: isActive
                            ? "calib-pulse 1.4s ease-in-out infinite"
                            : "none",
                        }}
                      >
                        <circle
                          cx={24}
                          cy={24}
                          r={18}
                          fill="rgba(99,102,241,0.2)"
                          stroke="rgba(99,102,241,0.3)"
                          strokeWidth={2}
                        />
                        {clicks > 0 && (
                          <circle
                            cx={24}
                            cy={24}
                            r={18}
                            fill="none"
                            stroke="#34d399"
                            strokeWidth={3}
                            strokeDasharray={circumference}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            transform="rotate(-90 24 24)"
                            style={{
                              transition: "stroke-dashoffset 0.2s ease",
                            }}
                          />
                        )}
                        <circle
                          cx={24}
                          cy={24}
                          r={7}
                          fill="rgba(99,102,241,1)"
                        />
                        <text
                          x={24}
                          y={40}
                          textAnchor="middle"
                          fill="rgba(255,255,255,0.6)"
                          fontSize={9}
                          fontFamily="Inter, sans-serif"
                          fontWeight={600}
                        >
                          {clicks}/{CALIB_CLICKS_NEEDED}
                        </text>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}

      {/* Main app */}
      {ready && !calibrating && (
        <>
          <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-zinc-950/80 border-b border-zinc-800/50 px-6 py-3 flex items-center justify-between">
            <span className="font-bold text-sm tracking-tight text-white flex items-center gap-2">
              <Eye size={16} className="text-indigo-400" /> VisionWeb
            </span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${gaze.started ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                {gaze.started ? "Eyes active" : "Calibrating…"}
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${hands.started ? "bg-violet-400" : "bg-zinc-600"}`}
                />
                {hands.started ? "Hands active" : "Loading…"}
              </div>
              <button
                onClick={() => setSettingsOpen((s) => !s)}
                className="p-2 rounded-lg hover:bg-white/[0.07] text-zinc-400 hover:text-white transition-all duration-150 cursor-pointer"
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setDebugOpen((s) => !s)}
                className="p-2 rounded-lg hover:bg-white/[0.07] text-zinc-400 hover:text-white transition-all duration-150 cursor-pointer"
              >
                <Bug size={15} />
              </button>
            </div>
          </nav>

          <div
            className="fixed inset-0 -z-10"
            style={{
              background: "#09090b",
              backgroundImage:
                "radial-gradient(ellipse at top, rgba(99,102,241,0.12), transparent 60%), radial-gradient(ellipse at bottom right, rgba(139,92,246,0.08), transparent 60%), radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "100% 100%, 100% 100%, 32px 32px",
            }}
          />

          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 glass rounded-2xl px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            {toolbarItems.map(([Icon, label, active, action]) => (
              <button
                key={label}
                onClick={action ?? undefined}
                title={label}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl transition-all duration-150 ${action ? "hover:bg-white/[0.1] active:scale-95 cursor-pointer" : "cursor-default"}`}
              >
                <Icon
                  size={16}
                  className={active ? "text-indigo-400" : "text-zinc-600"}
                />
                <span
                  className={`text-[9px] font-medium ${active ? "text-zinc-400" : "text-zinc-600"}`}
                >
                  {label}
                </span>
              </button>
            ))}
          </div>

          {/* Gaze cursor */}
          <div
            className="fixed pointer-events-none z-[9000]"
            style={{
              left: gaze.gaze.x - 12,
              top: gaze.gaze.y - 12,
              width: 24,
              height: 24,
              opacity: gaze.started ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          >
            <div className="w-6 h-6 rounded-full border-2 border-indigo-400/70 bg-indigo-400/10" />
            {dwell.dwellProgress > 0.02 && (
              <svg
                className="absolute inset-0 -rotate-90"
                width="24"
                height="24"
                viewBox="0 0 24 24"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="rgba(99,102,241,0.8)"
                  strokeWidth="2"
                  strokeDasharray={`${dwell.dwellProgress * 62.8} 62.8`}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>

          {panels.map((def) => (
            <SpatialPanel
              key={def.id}
              id={def.id}
              title={def.title}
              initialX={def.x}
              initialY={def.y}
              onClose={() => closePanel(def.id)}
              gazeFocused={dwell.focused?.id === def.id}
            >
              {renderPanelContent(def)}
            </SpatialPanel>
          ))}

          {debugOpen && (
            <div className="fixed top-16 right-4 z-[9001] w-64 glass rounded-2xl p-4 text-xs font-mono space-y-1.5">
              <div className="text-zinc-400 font-semibold text-[11px] mb-2 flex items-center gap-2">
                <Bug size={12} /> Debug
              </div>
              {(
                [
                  ["Gaze X", gaze.gaze.x.toFixed(0), true],
                  ["Gaze Y", gaze.gaze.y.toFixed(0), true],
                  ["FPS", String(hands.fps), hands.fps > 20],
                  ["Eye tracking", gaze.started ? "ON" : "OFF", gaze.started],
                  ["Hands", hands.started ? "ON" : "OFF", hands.started],
                  ["Dwell", `${(dwell.dwellProgress * 100).toFixed(0)}%`, true],
                  ["Panels", String(panels.length), true],
                ] as [string, string, boolean][]
              ).map(([label, val, ok]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-zinc-500">{label}</span>
                  <span className={ok ? "text-zinc-200" : "text-zinc-600"}>
                    {val}
                  </span>
                </div>
              ))}
            </div>
          )}

          {settingsOpen && (
            <div className="fixed top-1/2 right-6 -translate-y-1/2 z-[9001] w-72 glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="font-semibold text-sm">Settings</span>
                <button
                  onClick={() => setSettingsOpen(false)}
                  className="w-7 h-7 rounded-lg bg-white/[0.07] hover:bg-white/[0.15] text-zinc-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
              <div className="space-y-4 text-xs text-zinc-400">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Dwell time</span>
                    <span className="text-zinc-300">{dwellMs}ms</span>
                  </div>
                  <input
                    type="range"
                    min={400}
                    max={3000}
                    step={100}
                    value={dwellMs}
                    onChange={(e) => setDwellMs(parseInt(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span>Debug overlay</span>
                  <button
                    onClick={() => setDebugOpen((s) => !s)}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer ${debugOpen ? "bg-indigo-600" : "bg-zinc-700"}`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-200 ${debugOpen ? "left-5" : "left-0.5"}`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {gaze.started && (
            <div
              className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full glass text-xs text-zinc-500 pointer-events-none"
              style={{ animation: "fadeOut 1s ease 4s forwards" }}
            >
              Click around the screen to improve gaze accuracy
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes fadeOut {
          to { opacity: 0; }
        }
        @keyframes calib-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.7), 0 0 24px rgba(99,102,241,0.5); }
          50%  { box-shadow: 0 0 0 16px rgba(99,102,241,0), 0 0 32px rgba(99,102,241,0.3); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0), 0 0 24px rgba(99,102,241,0.5); }
        }
        #webgazerVideoContainer,
        #webgazerFaceOverlay,
        #webgazerFaceFeedbackBox,
        #webgazer-loading-screen,
        #gazeDot,
        video[id^="webgazer"] {
          display: none !important;
        }
      `}</style>
    </>
  );
}
