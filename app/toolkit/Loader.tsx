"use client";

import React, { useEffect, useState } from "react";

export default function ToolkitLoader() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    import("@/components/Toolkit")
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
            Toolkit import failed
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
              "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))",
            border: "1px solid rgba(99,102,241,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        />
      </div>
    );
  }

  return <Component />;
}
