"use client";

import React, { useEffect, useState } from "react";

export default function HandsPage() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import("@/components/HandsWeb")
      .then((mod) => setComponent(() => mod.default))
      .catch((err) => setError(String(err)));
  }, []);

  if (error) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "monospace",
          padding: 32,
        }}
      >
        <div style={{ maxWidth: 600 }}>
          <p style={{ color: "#f87171", fontWeight: 700, marginBottom: 8 }}>
            HandsWeb import failed
          </p>
          <pre
            style={{
              color: "#fca5a5",
              fontSize: 12,
              background: "#1c0a0a",
              padding: 16,
              borderRadius: 8,
              whiteSpace: "pre-wrap",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            {error}
          </pre>
        </div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#09090b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 28,
            background:
              "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.15))",
            border: "1px solid rgba(168,85,247,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
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
            <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
            <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
            <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
            <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
          </svg>
        </div>
      </div>
    );
  }

  return <Component />;
}
