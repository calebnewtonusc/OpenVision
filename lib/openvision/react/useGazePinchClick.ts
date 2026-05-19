"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PinchResult } from "../core/pinch";

export interface UseGazePinchClickOptions {
  /** The currently-focused element. Pass `useDwellClick().focused` or any element you choose. */
  focused: Element | null;
  /** Called when a pinch-release happens with a focused element. */
  onClick?: (el: HTMLElement) => void;
  /** Skip auto-firing `el.click()`; let `onClick` handle it. Default false. */
  manualClick?: boolean;
  /** Cooldown after a click before another can fire. Default 250ms. */
  cooldownMs?: number;
  /** Disable without unmounting. */
  enabled?: boolean;
}

export interface UseGazePinchClickResult {
  /** Feed each frame's pinch object. The first hand to release with a focused target wins. */
  feed: (pinches: {
    left: PinchResult | null;
    right: PinchResult | null;
  }) => void;
}

/**
 * The Vision Pro interaction model: gaze targets, pinch commits.
 *
 * Look at any element to focus it (uses your `useDwellClick` instance for
 * the focus engine), then briefly close thumb + index to click it. No dwell
 * required, no waiting. Pinch-released anywhere fires a click on whatever
 * was focused at that instant.
 */
export function useGazePinchClick(
  opts: UseGazePinchClickOptions,
): UseGazePinchClickResult {
  const {
    focused,
    onClick,
    manualClick = false,
    cooldownMs = 250,
    enabled = true,
  } = opts;

  const focusedRef = useRef<Element | null>(focused);
  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const lastFiredRef = useRef(0);
  const prevLeftRef = useRef<PinchResult["state"]>("idle");
  const prevRightRef = useRef<PinchResult["state"]>("idle");

  const feed = useCallback(
    (pinches: { left: PinchResult | null; right: PinchResult | null }) => {
      if (!enabled) return;
      const tryFire = (side: "left" | "right", result: PinchResult | null) => {
        const prev =
          side === "left" ? prevLeftRef.current : prevRightRef.current;
        const cur = result?.state ?? "idle";
        const wasPinched = ["pinching", "holding", "dragging"].includes(prev);
        const released = wasPinched && cur === "released";
        if (released) {
          const now = performance.now();
          if (now - lastFiredRef.current >= cooldownMs) {
            const el = focusedRef.current as HTMLElement | null;
            if (el) {
              lastFiredRef.current = now;
              onClickRef.current?.(el);
              if (!manualClick) el.click();
            }
          }
        }
        if (side === "left") prevLeftRef.current = cur;
        else prevRightRef.current = cur;
      };
      tryFire("left", pinches.left);
      tryFire("right", pinches.right);
    },
    [enabled, cooldownMs, manualClick],
  );

  return { feed };
}
