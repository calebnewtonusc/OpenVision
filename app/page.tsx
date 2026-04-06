"use client";

import Link from "next/link";
import { Eye, Hand, Sparkles } from "lucide-react";

const features = [
  {
    icon: Eye,
    color: "#818cf8",
    bg: "rgba(99,102,241,0.1)",
    border: "rgba(99,102,241,0.2)",
    title: "Eye Tracking",
    description:
      "WebGazer.js tracks your gaze in real time. Calibrate once and control the interface entirely with your eyes.",
    href: "/vision",
    cta: "Open VisionWeb",
    ctaColor: "#6366f1",
    ctaShadow: "rgba(99,102,241,0.4)",
  },
  {
    icon: Hand,
    color: "#c084fc",
    bg: "rgba(168,85,247,0.1)",
    border: "rgba(168,85,247,0.2)",
    title: "Hand Tracking",
    description:
      "MediaPipe tracks 21 landmarks per hand. Pinch, point, grab, and gesture to interact with particles, fluid, and 3D objects.",
    href: "/hands",
    cta: "Open HandsWeb",
    ctaColor: "#a855f7",
    ctaShadow: "rgba(168,85,247,0.4)",
  },
];

export default function Home() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background:
          "radial-gradient(ellipse at 50% 20%, rgba(99,102,241,0.15), transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(168,85,247,0.1), transparent 50%), #09090b",
        fontFamily: "Inter, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "auto",
      }}
    >
      {/* Dot grid */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 680,
          padding: "60px 24px",
          textAlign: "center",
        }}
      >
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 20,
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
            marginBottom: 32,
          }}
        >
          <Sparkles size={12} color="#818cf8" />
          <span style={{ color: "#818cf8", fontSize: 12, fontWeight: 600 }}>
            Spatial computing in your browser
          </span>
        </div>

        <h1
          style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            margin: "0 0 16px",
            lineHeight: 1.1,
            background:
              "linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.45))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          OpenVision
        </h1>

        <p
          style={{
            color: "#71717a",
            fontSize: 16,
            lineHeight: 1.7,
            margin: "0 auto 56px",
            maxWidth: 480,
          }}
        >
          Apple Vision Pro-style spatial interfaces running entirely in your
          browser. Camera only. No headset, no app, no install.
        </p>

        {/* Feature cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {features.map((f) => (
            <Link key={f.href} href={f.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.07)",
                  background: "rgba(255,255,255,0.03)",
                  padding: 24,
                  textAlign: "left",
                  transition:
                    "border-color 0.2s ease, background 0.2s ease, transform 0.2s ease",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.border =
                    `1px solid ${f.border}`;
                  (e.currentTarget as HTMLDivElement).style.background = f.bg;
                  (e.currentTarget as HTMLDivElement).style.transform =
                    "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.border =
                    "1px solid rgba(255,255,255,0.07)";
                  (e.currentTarget as HTMLDivElement).style.background =
                    "rgba(255,255,255,0.03)";
                  (e.currentTarget as HTMLDivElement).style.transform = "none";
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    background: f.bg,
                    border: `1px solid ${f.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                  }}
                >
                  <f.icon size={22} color={f.color} />
                </div>
                <div
                  style={{
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 16,
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    color: "#71717a",
                    fontSize: 13,
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  {f.description}
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 16px",
                    borderRadius: 12,
                    background: `linear-gradient(135deg, ${f.ctaColor}, ${f.color})`,
                    boxShadow: `0 4px 16px ${f.ctaShadow}`,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {f.cta}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <p style={{ color: "#3f3f46", fontSize: 11, lineHeight: 1.6 }}>
          Camera stays local. Everything runs on-device. Nothing leaves your
          browser.
        </p>
      </div>
    </div>
  );
}
