"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GazeSample } from "../core/types";

type WG = {
  begin: () => Promise<unknown>;
  end: () => unknown;
  pause: () => unknown;
  setGazeListener: (fn: (d: { x: number; y: number } | null) => void) => WG;
  clearGazeListener: () => WG;
  setRegression: (name: string) => WG;
  setTracker: (name: string) => WG;
  saveDataAcrossSessions: (v: boolean) => WG;
  applyKalmanFilter: (v: boolean) => WG;
  showVideo: (v: boolean) => WG;
  showFaceOverlay: (v: boolean) => WG;
  showFaceFeedbackBox: (v: boolean) => WG;
  showPredictionPoints: (v: boolean) => WG;
  clearData: () => Promise<void>;
  recordScreenPosition: (x: number, y: number, t?: string) => WG;
  removeMouseEventListeners: () => WG;
  addMouseEventListeners: () => WG;
};

export interface UseGazeTrackingOptions {
  /** Called for every accepted gaze sample. Use refs inside to avoid re-renders. */
  onSample?: (sample: GazeSample) => void;
  /** Max single-frame jump in px before a sample is dropped as an outlier. Default 300. */
  maxJumpPx?: number;
  /** Auto-load webgazer.js from this CDN if not already present. */
  cdn?: string;
}

export interface UseGazeTrackingResult {
  start: () => Promise<void>;
  stop: () => void;
  /** Record a calibration click at the given page coords. */
  record: (x: number, y: number) => void;
  /** Clear all training samples. */
  clear: () => Promise<void>;
  started: boolean;
  loading: boolean;
  /** Most recent accepted gaze sample. */
  gaze: GazeSample;
}

const DEFAULT_CDN = "https://webgazer.cs.brown.edu/webgazer.js";

async function loadWebGazer(cdn: string): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>).webgazer) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = cdn;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load webgazer.js"));
    document.head.appendChild(s);
  });
}

function getWG(): WG | undefined {
  return (window as unknown as Record<string, unknown>).webgazer as
    | WG
    | undefined;
}

/**
 * WebGazer wrapped as a React hook.
 *
 * Loads webgazer.js from CDN, configures ridge regression with a Kalman
 * filter, and exposes accepted gaze samples through `onSample` and React
 * state. Outliers (single-frame jumps > maxJumpPx) and the known top-left
 * default sample are dropped.
 */
export function useGazeTracking(
  opts: UseGazeTrackingOptions = {},
): UseGazeTrackingResult {
  const { onSample, maxJumpPx = 300, cdn = DEFAULT_CDN } = opts;
  const onSampleRef = useRef(onSample);
  useEffect(() => {
    onSampleRef.current = onSample;
  }, [onSample]);

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gaze, setGaze] = useState<GazeSample>({ x: -100, y: -100 });

  const startedRef = useRef(false);
  const smoothedRef = useRef<GazeSample>({ x: -1, y: -1 });
  const calibViewportRef = useRef({ w: 0, h: 0 });

  const start = useCallback(async () => {
    if (startedRef.current) return;
    setLoading(true);
    try {
      await loadWebGazer(cdn);
    } catch (err) {
      setLoading(false);
      throw err;
    }
    let waited = 0;
    while (!getWG() && waited < 10000) {
      await new Promise((r) => setTimeout(r, 100));
      waited += 100;
    }
    const wg = getWG();
    if (!wg) {
      setLoading(false);
      throw new Error("WebGazer failed to initialize");
    }

    try {
      Object.keys(localStorage)
        .filter((k) => k.toLowerCase().includes("webgazer"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* private mode */
    }

    wg.saveDataAcrossSessions(false);
    wg.setRegression("ridge");
    wg.setTracker("TFFacemesh");
    wg.applyKalmanFilter(true);

    wg.setGazeListener((data) => {
      if (!data) return;
      const cw = calibViewportRef.current.w;
      const ch = calibViewportRef.current.h;
      const scaledX = cw > 0 ? data.x * (window.innerWidth / cw) : data.x;
      const scaledY = ch > 0 ? data.y * (window.innerHeight / ch) : data.y;
      if (scaledX < 30 && scaledY < 30) return;
      if (scaledX > window.innerWidth + 200) return;
      if (scaledY > window.innerHeight + 200) return;
      const x = Math.max(0, Math.min(scaledX, window.innerWidth));
      const y = Math.max(0, Math.min(scaledY, window.innerHeight));
      if (smoothedRef.current.x === -1) {
        smoothedRef.current = { x, y };
      }
      const jump = Math.hypot(
        x - smoothedRef.current.x,
        y - smoothedRef.current.y,
      );
      if (jump > maxJumpPx) return;
      smoothedRef.current = { x, y };
      setGaze({ x, y });
      onSampleRef.current?.({ x, y });
    });

    await wg.begin();
    wg.showVideo(false);
    wg.showFaceOverlay(false);
    wg.showFaceFeedbackBox(false);
    wg.showPredictionPoints(false);
    await wg.clearData();

    startedRef.current = true;
    setStarted(true);
    setLoading(false);
  }, [cdn, maxJumpPx]);

  const stop = useCallback(() => {
    const wg = getWG();
    wg?.end?.();
    startedRef.current = false;
    smoothedRef.current = { x: -1, y: -1 };
    setStarted(false);
  }, []);

  const record = useCallback((x: number, y: number) => {
    const wg = getWG();
    wg?.recordScreenPosition?.(x, y, "click");
    calibViewportRef.current = { w: window.innerWidth, h: window.innerHeight };
  }, []);

  const clear = useCallback(async () => {
    const wg = getWG();
    if (wg) await wg.clearData();
  }, []);

  useEffect(() => {
    return () => {
      getWG()?.end?.();
    };
  }, []);

  return { start, stop, record, clear, started, loading, gaze };
}
