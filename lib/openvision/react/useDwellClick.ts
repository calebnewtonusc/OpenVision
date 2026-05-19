"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GazeSample } from "../core/types";

export interface UseDwellClickOptions {
  /** Dwell duration in ms before firing a click. Default 1200. */
  dwellMs?: number;
  /** How long a candidate must stay closest before switching focus. Default 180. */
  stabilityMs?: number;
  /** Hysteresis radius: keep current focus if gaze stays within this px. Default 60. */
  switchDistPx?: number;
  /** CSS attribute selector for gaze-clickable elements. Default `[data-gaze-target]`. */
  selector?: string;
  /** Class added to the currently-focused element. Default `gaze-focus`. */
  focusClass?: string;
  /** Cooldown after firing before another click can register. Default 800ms. */
  cooldownMs?: number;
  /** Called when an element receives a dwell-click. Element will also be `.click()`ed by default. */
  onDwellClick?: (el: HTMLElement) => void;
  /** Skip the automatic `.click()` and let `onDwellClick` handle it. Default false. */
  manualClick?: boolean;
}

export interface UseDwellClickResult {
  /** Feed every gaze sample through this. Returns current dwell progress 0..1. */
  feed: (sample: GazeSample) => number;
  /** Current dwell progress 0..1, as React state. Lags `feed` by one render. */
  dwellProgress: number;
  /** Currently focused element, if any. */
  focused: Element | null;
}

/**
 * Dwell-to-click: stare at a target for N ms to fire its click handler.
 *
 * Hook owns the focus engine state. Each instance tracks its own current
 * focus, candidate, and dwell timer — safe to mount multiple if needed.
 */
export function useDwellClick(
  opts: UseDwellClickOptions = {},
): UseDwellClickResult {
  const {
    dwellMs = 1200,
    stabilityMs = 180,
    switchDistPx = 60,
    selector = "[data-gaze-target]",
    focusClass = "gaze-focus",
    cooldownMs = 800,
    onDwellClick,
    manualClick = false,
  } = opts;

  const onDwellRef = useRef(onDwellClick);
  useEffect(() => {
    onDwellRef.current = onDwellClick;
  }, [onDwellClick]);

  const currentRef = useRef<Element | null>(null);
  const candidateRef = useRef<Element | null>(null);
  const candidateStartRef = useRef(0);
  const dwellStartRef = useRef(0);
  const firedRef = useRef(false);

  const [dwellProgress, setDwellProgress] = useState(0);
  const [focused, setFocused] = useState<Element | null>(null);

  const feed = useCallback(
    (sample: GazeSample) => {
      const now = performance.now();
      const { x, y } = sample;
      const targets = Array.from(document.querySelectorAll(selector)).filter(
        (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        },
      );

      let best: Element | null = null;
      let bestDist = Infinity;
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(x - cx, y - cy);
        const reach = Math.max(r.width, r.height) * 0.7 + 40;
        if (d < reach && d < bestDist) {
          bestDist = d;
          best = el;
        }
      }

      if (currentRef.current && best !== currentRef.current) {
        const r = currentRef.current.getBoundingClientRect();
        if (
          Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) <
          switchDistPx
        ) {
          best = currentRef.current;
        }
      }

      if (best !== candidateRef.current) {
        candidateRef.current = best;
        candidateStartRef.current = now;
      }
      if (
        best &&
        now - candidateStartRef.current >= stabilityMs &&
        best !== currentRef.current
      ) {
        currentRef.current?.classList.remove(focusClass);
        currentRef.current = best;
        dwellStartRef.current = now;
        currentRef.current?.classList.add(focusClass);
        setFocused(currentRef.current);
      }

      const progress = currentRef.current
        ? Math.min((now - dwellStartRef.current) / dwellMs, 1)
        : 0;
      setDwellProgress(progress);

      if (progress >= 1 && currentRef.current && !firedRef.current) {
        firedRef.current = true;
        const el = currentRef.current as HTMLElement;
        onDwellRef.current?.(el);
        if (!manualClick) el.click();
        dwellStartRef.current = now;
        setTimeout(() => {
          firedRef.current = false;
        }, cooldownMs);
      } else if (progress < 0.9) {
        firedRef.current = false;
      }

      return progress;
    },
    [
      dwellMs,
      stabilityMs,
      switchDistPx,
      selector,
      focusClass,
      cooldownMs,
      manualClick,
    ],
  );

  useEffect(() => {
    return () => {
      currentRef.current?.classList.remove(focusClass);
      currentRef.current = null;
      candidateRef.current = null;
    };
  }, [focusClass]);

  return { feed, dwellProgress, focused };
}
