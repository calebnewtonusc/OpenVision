"use client";

import { useEffect, useRef, useState } from "react";
import type { PinchResult } from "@/lib/openvision";

interface Photo {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  z: number;
  hue: number;
  label: string;
}

const SEED_PHOTOS: Omit<Photo, "id" | "z">[] = [
  { x: 0.18, y: 0.32, scale: 1, rotation: -0.12, hue: 260, label: "Aurora" },
  { x: 0.46, y: 0.22, scale: 1.08, rotation: 0.05, hue: 200, label: "Cascade" },
  { x: 0.74, y: 0.36, scale: 0.95, rotation: 0.14, hue: 320, label: "Riff" },
  { x: 0.28, y: 0.66, scale: 1.02, rotation: 0.08, hue: 170, label: "Cove" },
  { x: 0.58, y: 0.7, scale: 0.97, rotation: -0.08, hue: 30, label: "Ember" },
  { x: 0.82, y: 0.62, scale: 1.06, rotation: -0.18, hue: 280, label: "Verge" },
];

interface Props {
  pinches: { left: PinchResult | null; right: PinchResult | null };
  twoHand: {
    active: boolean;
    scaleDelta: number;
    rotationDelta: number;
    center: { x: number; y: number };
  };
}

/**
 * Photo wall driven by pinch gestures:
 *  - Single-hand pinch + drag → move a photo
 *  - Two-hand pinch → scale + rotate the active photo
 *
 * Photos drift gently when idle. Hand-driven motion takes priority.
 */
export function SpatialPhotoWall({ pinches, twoHand }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    SEED_PHOTOS.map((p, i) => ({ ...p, id: `p${i}`, z: i })),
  );
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const grabbedRef = useRef<{
    photoId: string | null;
    side: "left" | "right" | null;
    grabX: number;
    grabY: number;
    photoX: number;
    photoY: number;
  }>({ photoId: null, side: null, grabX: 0, grabY: 0, photoX: 0, photoY: 0 });
  const zCounter = useRef(SEED_PHOTOS.length);

  const findPhotoAt = (nx: number, ny: number): Photo | null => {
    const ordered = [...photosRef.current].sort((a, b) => b.z - a.z);
    for (const p of ordered) {
      const half = 0.12 * p.scale;
      if (
        nx >= p.x - half &&
        nx <= p.x + half &&
        ny >= p.y - half * 1.2 &&
        ny <= p.y + half * 1.2
      ) {
        return p;
      }
    }
    return null;
  };

  useEffect(() => {
    const handleSide = (side: "left" | "right", result: PinchResult | null) => {
      if (!result || !result.center) {
        if (grabbedRef.current.side === side) {
          grabbedRef.current = {
            photoId: null,
            side: null,
            grabX: 0,
            grabY: 0,
            photoX: 0,
            photoY: 0,
          };
        }
        return;
      }
      const nx = 1 - result.center.x;
      const ny = result.center.y;
      const pinched = ["pinching", "holding", "dragging"].includes(
        result.state,
      );

      if (pinched && grabbedRef.current.photoId === null && !twoHand.active) {
        const hit = findPhotoAt(nx, ny);
        if (hit) {
          zCounter.current += 1;
          const newZ = zCounter.current;
          grabbedRef.current = {
            photoId: hit.id,
            side,
            grabX: nx,
            grabY: ny,
            photoX: hit.x,
            photoY: hit.y,
          };
          setPhotos((prev) =>
            prev.map((p) => (p.id === hit.id ? { ...p, z: newZ } : p)),
          );
        }
      } else if (
        pinched &&
        grabbedRef.current.photoId &&
        grabbedRef.current.side === side &&
        !twoHand.active
      ) {
        const dx = nx - grabbedRef.current.grabX;
        const dy = ny - grabbedRef.current.grabY;
        const targetX = grabbedRef.current.photoX + dx;
        const targetY = grabbedRef.current.photoY + dy;
        const photoId = grabbedRef.current.photoId;
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? {
                  ...p,
                  x: Math.max(0.06, Math.min(0.94, targetX)),
                  y: Math.max(0.08, Math.min(0.92, targetY)),
                }
              : p,
          ),
        );
      } else if (!pinched && grabbedRef.current.side === side) {
        grabbedRef.current = {
          photoId: null,
          side: null,
          grabX: 0,
          grabY: 0,
          photoX: 0,
          photoY: 0,
        };
      }
    };
    handleSide("left", pinches.left);
    handleSide("right", pinches.right);
  }, [pinches, twoHand.active]);

  useEffect(() => {
    if (!twoHand.active) return;
    const cx = 1 - twoHand.center.x;
    const cy = twoHand.center.y;
    const topByZ = [...photosRef.current].sort((a, b) => b.z - a.z);
    const target = findPhotoAt(cx, cy) ?? topByZ[0];
    if (!target) return;
    const id = target.id;
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              scale: Math.max(
                0.55,
                Math.min(2.4, p.scale * twoHand.scaleDelta),
              ),
              rotation: p.rotation + twoHand.rotationDelta,
            }
          : p,
      ),
    );
  }, [twoHand]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 10",
        borderRadius: 16,
        background:
          "radial-gradient(ellipse at top, rgba(99,102,241,0.18), rgba(10,10,10,0.95)), #0a0a0a",
        border: "1px solid rgba(255,255,255,0.06)",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.4,
        }}
      />
      {photos.map((p) => {
        const isGrabbed = grabbedRef.current.photoId === p.id;
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              transform: `translate(-50%, -50%) scale(${p.scale}) rotate(${p.rotation}rad)`,
              transition: isGrabbed
                ? "none"
                : "transform 0.18s ease-out, box-shadow 0.2s",
              zIndex: Math.floor(p.z),
              width: "22%",
              aspectRatio: "3 / 4",
              borderRadius: 14,
              overflow: "hidden",
              background: `linear-gradient(135deg, hsl(${p.hue}, 80%, 62%), hsl(${(p.hue + 50) % 360}, 70%, 38%))`,
              boxShadow: isGrabbed
                ? "0 24px 64px rgba(99,102,241,0.55), 0 0 0 2px rgba(99,102,241,0.7)"
                : "0 16px 40px rgba(0,0,0,0.5)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), transparent 55%)",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 10,
                color: "white",
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                textShadow: "0 2px 8px rgba(0,0,0,0.6)",
              }}
            >
              {p.label}
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          padding: "6px 10px",
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: twoHand.active ? "#fbbf24" : "#a1a1aa",
          background: twoHand.active
            ? "rgba(251,191,36,0.12)"
            : "rgba(255,255,255,0.04)",
          border: `1px solid ${twoHand.active ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
        }}
      >
        {twoHand.active
          ? `Two-hand: ${twoHand.scaleDelta.toFixed(2)}x`
          : "Pinch + drag to move. Two-hand pinch to zoom + rotate."}
      </div>
    </div>
  );
}
