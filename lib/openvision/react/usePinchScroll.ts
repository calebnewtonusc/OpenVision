"use client";

import { useCallback, useRef, type RefObject } from "react";
import type { PinchResult } from "../core/pinch";

export interface UsePinchScrollOptions {
  /** The scrollable element. Pass a ref; pass `null` to scroll the window. */
  target: RefObject<HTMLElement | null> | null;
  /** Pinch-y-delta multiplier. Higher = scrolls faster. Default 1400. */
  sensitivity?: number;
  /** Per-frame scroll cap in pixels. Prevents jolts. Default 240. */
  maxStep?: number;
  /** Toggle the handler without unmounting. Default true. */
  enabled?: boolean;
  /** Invert direction. By default, hand moves up = page scrolls down (Vision Pro feel). */
  invert?: boolean;
}

export interface UsePinchScrollResult {
  /** Pass each frame's PinchResult here. Null is fine (no hand on that side). Returns px scrolled. */
  apply: (result: PinchResult | null) => number;
}

/**
 * Bind a hand-tracking pinch gesture to a scrollable element.
 *
 * Usage:
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   const { apply } = usePinchScroll({ target: scrollRef });
 *   useHandTracking({ video, onFrame: (f) => { apply(f.pinches.left); apply(f.pinches.right); } });
 */
export function usePinchScroll(
  opts: UsePinchScrollOptions,
): UsePinchScrollResult {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const apply = useCallback((result: PinchResult | null) => {
    if (!result) return 0;
    const o = optsRef.current;
    if (o.enabled === false) return 0;
    if (result.state !== "dragging") return 0;

    const sensitivity = o.sensitivity ?? 1400;
    const maxStep = o.maxStep ?? 240;
    const sign = o.invert ? 1 : -1;
    const raw = sign * result.delta.y * sensitivity;
    const amt = Math.sign(raw) * Math.min(Math.abs(raw), maxStep);

    if (amt === 0) return 0;

    const el = o.target?.current;
    if (el) {
      el.scrollTop += amt;
    } else {
      window.scrollBy({ top: amt, behavior: "instant" });
    }
    return amt;
  }, []);

  return { apply };
}
