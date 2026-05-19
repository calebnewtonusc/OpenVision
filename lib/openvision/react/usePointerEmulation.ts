"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PinchResult } from "../core/pinch";
import type { GazeSample } from "../core/types";

export interface UsePointerEmulationOptions {
  /** Disable without unmounting. */
  enabled?: boolean;
  /** Dispatch pointermove on every gaze sample, not just on pinch state changes. */
  emitMove?: boolean;
  /** Cooldown after a click before another click fires. Default 200ms. */
  cooldownMs?: number;
  /** Optional callback fired alongside the native click. */
  onClick?: (el: Element, x: number, y: number) => void;
}

export interface UsePointerEmulationResult {
  /** Feed every gaze sample. */
  setGaze: (s: GazeSample) => void;
  /** Feed each frame's pinch object. */
  feedPinch: (pinches: {
    left: PinchResult | null;
    right: PinchResult | null;
  }) => void;
}

/**
 * Emit native pointer events at the gaze position when a pinch fires. This
 * lets ANY clickable element on the page respond to gaze + pinch, not just
 * elements tagged `data-gaze-target`.
 *
 * - pinch start  → pointerdown at gaze coords
 * - pinch end    → pointerup + click at gaze coords
 * - gaze sample  → pointermove (only if `emitMove`)
 *
 * Use sparingly: this synthesizes events that normal browser code expects to
 * come from a real input device. It is the right primitive for porting an
 * existing UI to spatial input without rewriting handlers.
 */
export function usePointerEmulation(
  opts: UsePointerEmulationOptions = {},
): UsePointerEmulationResult {
  const { enabled = true, emitMove = false, cooldownMs = 200, onClick } = opts;

  const gazeRef = useRef<GazeSample>({ x: -100, y: -100 });
  const lastClickRef = useRef(0);
  const prevLeftRef = useRef<PinchResult["state"]>("idle");
  const prevRightRef = useRef<PinchResult["state"]>("idle");
  const downElRef = useRef<Element | null>(null);
  const enabledRef = useRef(enabled);
  const emitMoveRef = useRef(emitMove);
  const onClickRef = useRef(onClick);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    emitMoveRef.current = emitMove;
  }, [emitMove]);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  const dispatch = (
    type: "pointerdown" | "pointermove" | "pointerup" | "click",
    el: Element,
    x: number,
    y: number,
  ) => {
    const init: PointerEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
      isPrimary: true,
    };
    if (type === "click") {
      el.dispatchEvent(
        new MouseEvent("click", { ...init, button: 0, buttons: 0 }),
      );
    } else {
      el.dispatchEvent(new PointerEvent(type, init));
    }
  };

  const setGaze = useCallback((s: GazeSample) => {
    gazeRef.current = s;
    if (emitMoveRef.current && enabledRef.current) {
      const el = document.elementFromPoint(s.x, s.y);
      if (el) dispatch("pointermove", el, s.x, s.y);
    }
  }, []);

  const feedPinch = useCallback(
    (pinches: { left: PinchResult | null; right: PinchResult | null }) => {
      if (!enabledRef.current) return;
      const tryFire = (side: "left" | "right", result: PinchResult | null) => {
        const prev =
          side === "left" ? prevLeftRef.current : prevRightRef.current;
        const cur = result?.state ?? "idle";
        const wasPinched = ["pinching", "holding", "dragging"].includes(prev);
        const nowPinched = ["pinching", "holding", "dragging"].includes(cur);

        if (!wasPinched && nowPinched) {
          const { x, y } = gazeRef.current;
          const el = document.elementFromPoint(x, y);
          if (el) {
            downElRef.current = el;
            dispatch("pointerdown", el, x, y);
          }
        } else if (wasPinched && !nowPinched) {
          const { x, y } = gazeRef.current;
          const upEl = document.elementFromPoint(x, y) ?? downElRef.current;
          if (upEl) {
            dispatch("pointerup", upEl, x, y);
            const now = performance.now();
            if (now - lastClickRef.current >= cooldownMs) {
              lastClickRef.current = now;
              dispatch("click", upEl, x, y);
              onClickRef.current?.(upEl, x, y);
            }
          }
          downElRef.current = null;
        }

        if (side === "left") prevLeftRef.current = cur;
        else prevRightRef.current = cur;
      };
      tryFire("left", pinches.left);
      tryFire("right", pinches.right);
    },
    [cooldownMs],
  );

  return { setGaze, feedPinch };
}
