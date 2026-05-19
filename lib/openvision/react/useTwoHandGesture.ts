"use client";

import { useCallback, useRef, useState } from "react";
import type { PinchResult } from "../core/pinch";

export interface TwoHandGestureState {
  /** True while both hands are pinching. */
  active: boolean;
  /** Distance ratio: 1.0 at start, 2.0 = hands twice as far apart, 0.5 = half. */
  scale: number;
  /** Rotation in radians from start. Positive = counter-clockwise. */
  rotation: number;
  /** Midpoint of the two pinch centers in image coords (0..1). */
  center: { x: number; y: number };
  /** Per-frame delta of scale (1.0 = unchanged). */
  scaleDelta: number;
  /** Per-frame delta of rotation in radians. */
  rotationDelta: number;
}

const initialState: TwoHandGestureState = {
  active: false,
  scale: 1,
  rotation: 0,
  center: { x: 0.5, y: 0.5 },
  scaleDelta: 1,
  rotationDelta: 0,
};

/**
 * Two-handed zoom and rotate. Both hands must be pinching (dragging or holding).
 *
 * - `scale`: how much the hands have moved apart since the gesture began. 1.0 means
 *   unchanged; 2.0 means twice as far apart.
 * - `rotation`: radians from start. Sign follows screen-space (right-hand rule
 *   inverted for image y-down).
 * - `scaleDelta` / `rotationDelta`: per-frame deltas, more useful for direct
 *   manipulation (multiply your transform by `scaleDelta`, add `rotationDelta`).
 *
 * Feed every frame's `pinches` object from `useHandTracking`.
 */
export function useTwoHandGesture() {
  const startDistRef = useRef<number | null>(null);
  const startAngleRef = useRef<number | null>(null);
  const lastDistRef = useRef<number | null>(null);
  const lastAngleRef = useRef<number | null>(null);

  const [state, setState] = useState<TwoHandGestureState>(initialState);

  const update = useCallback(
    (pinches: { left: PinchResult | null; right: PinchResult | null }) => {
      const l = pinches.left;
      const r = pinches.right;
      const bothActive =
        !!l &&
        !!r &&
        !!l.center &&
        !!r.center &&
        ["pinching", "holding", "dragging"].includes(l.state) &&
        ["pinching", "holding", "dragging"].includes(r.state);

      if (!bothActive) {
        if (state.active) setState(initialState);
        startDistRef.current = null;
        startAngleRef.current = null;
        lastDistRef.current = null;
        lastAngleRef.current = null;
        return;
      }

      const lx = l!.center!.x;
      const ly = l!.center!.y;
      const rx = r!.center!.x;
      const ry = r!.center!.y;
      const dx = rx - lx;
      const dy = ry - ly;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const cx = (lx + rx) / 2;
      const cy = (ly + ry) / 2;

      if (startDistRef.current === null || startAngleRef.current === null) {
        startDistRef.current = dist;
        startAngleRef.current = angle;
        lastDistRef.current = dist;
        lastAngleRef.current = angle;
        setState({
          active: true,
          scale: 1,
          rotation: 0,
          center: { x: cx, y: cy },
          scaleDelta: 1,
          rotationDelta: 0,
        });
        return;
      }

      const scale = dist / Math.max(startDistRef.current, 0.0001);
      let rotation = angle - startAngleRef.current;
      while (rotation > Math.PI) rotation -= 2 * Math.PI;
      while (rotation < -Math.PI) rotation += 2 * Math.PI;

      const scaleDelta =
        lastDistRef.current && lastDistRef.current > 0.0001
          ? dist / lastDistRef.current
          : 1;
      let rotationDelta = lastAngleRef.current
        ? angle - lastAngleRef.current
        : 0;
      while (rotationDelta > Math.PI) rotationDelta -= 2 * Math.PI;
      while (rotationDelta < -Math.PI) rotationDelta += 2 * Math.PI;

      lastDistRef.current = dist;
      lastAngleRef.current = angle;

      setState({
        active: true,
        scale,
        rotation,
        center: { x: cx, y: cy },
        scaleDelta,
        rotationDelta,
      });
    },
    [state.active],
  );

  return { state, update };
}
