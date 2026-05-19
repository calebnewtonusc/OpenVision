"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { GestureName, HandData, HandSide, Landmark } from "../core/types";
import { PinchDetector, type PinchResult } from "../core/pinch";
import { classifyGesture } from "../core/gestures";

export interface HandFrame {
  hands: HandData[];
  pinches: { left: PinchResult | null; right: PinchResult | null };
  gestures: { left: GestureName; right: GestureName };
  now: number;
}

export interface UseHandTrackingOptions {
  /** Video element ref. Pass the `useRef<HTMLVideoElement>` itself, not its current value. */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Called every time MediaPipe emits results. Use refs inside to avoid re-renders. */
  onFrame?: (frame: HandFrame) => void;
  /** MediaPipe Hands options. Defaults to two hands, complexity 1. */
  options?: {
    maxNumHands?: number;
    modelComplexity?: 0 | 1;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  };
  /** CDN URL prefix. Override to self-host. */
  cdn?: string;
}

export interface UseHandTrackingResult {
  start: () => Promise<void>;
  stop: () => void;
  started: boolean;
  loading: boolean;
  fps: number;
  handCount: number;
  gesture: { left: GestureName; right: GestureName };
}

type RawLandmark = { x: number; y: number; z: number };
type RawResults = {
  multiHandLandmarks?: RawLandmark[][];
  multiHandedness?: { label: string; score: number }[];
};
type HandsInstance = {
  setOptions: (o: Record<string, unknown>) => void;
  onResults: (cb: (r: RawResults) => void) => void;
  send: (i: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
};

const DEFAULT_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/hands";

async function loadMediaPipeHands(cdn: string): Promise<void> {
  if (typeof window === "undefined") return;
  if ((window as unknown as Record<string, unknown>).Hands) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${cdn}/hands.js`;
    s.crossOrigin = "anonymous";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load @mediapipe/hands"));
    document.head.appendChild(s);
  });
}

/**
 * MediaPipe Hands wrapped as a React hook.
 *
 * Loads the @mediapipe/hands script from CDN, attaches it to the given video
 * element, and fires `onFrame` for every result with hand landmarks, pinch
 * state per hand, and classified gesture per hand.
 *
 * High-frequency data (landmarks, pinch deltas) is delivered through the
 * `onFrame` callback. Low-frequency display state (fps, handCount, gesture
 * labels) is exposed as React state.
 */
export function useHandTracking(
  opts: UseHandTrackingOptions,
): UseHandTrackingResult {
  const { videoRef, onFrame, options, cdn = DEFAULT_CDN } = opts;
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const handsRef = useRef<HandsInstance | null>(null);
  const animRef = useRef<number>(0);
  const sendingRef = useRef(false);
  const pinchL = useRef(new PinchDetector());
  const pinchR = useRef(new PinchDetector());
  const startedRef = useRef(false);

  const fpsFrames = useRef(0);
  const fpsLast = useRef(0);

  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fps, setFps] = useState(0);
  const [handCount, setHandCount] = useState(0);
  const [gesture, setGesture] = useState<{
    left: GestureName;
    right: GestureName;
  }>({
    left: "none",
    right: "none",
  });

  const start = useCallback(async () => {
    if (startedRef.current || !videoRef.current) return;
    startedRef.current = true;
    setLoading(true);

    try {
      await loadMediaPipeHands(cdn);
    } catch (err) {
      startedRef.current = false;
      setLoading(false);
      throw err;
    }

    const HandsCtor = (
      window as unknown as {
        Hands: new (o: Record<string, unknown>) => HandsInstance;
      }
    ).Hands;

    const hi = new HandsCtor({
      locateFile: (f: string) => `${cdn}/${f}`,
    });
    hi.setOptions({
      maxNumHands: options?.maxNumHands ?? 2,
      modelComplexity: options?.modelComplexity ?? 1,
      minDetectionConfidence: options?.minDetectionConfidence ?? 0.7,
      minTrackingConfidence: options?.minTrackingConfidence ?? 0.6,
    });

    hi.onResults((results) => {
      const now = performance.now();
      fpsFrames.current++;
      if (now - fpsLast.current >= 1000) {
        setFps(fpsFrames.current);
        fpsFrames.current = 0;
        fpsLast.current = now;
      }

      if (!results.multiHandLandmarks?.length) {
        const pl = pinchL.current.update(null, now);
        const pr = pinchR.current.update(null, now);
        setHandCount(0);
        setGesture({ left: "none", right: "none" });
        onFrameRef.current?.({
          hands: [],
          pinches: { left: pl, right: pr },
          gestures: { left: "none", right: "none" },
          now,
        });
        return;
      }

      const hands: HandData[] = [];
      const newGesture: { left: GestureName; right: GestureName } = {
        left: "none",
        right: "none",
      };
      let pl: PinchResult | null = null;
      let pr: PinchResult | null = null;

      results.multiHandLandmarks.forEach((lm, i) => {
        const side: HandSide =
          (results.multiHandedness?.[i]?.label?.toLowerCase() as HandSide) ??
          "right";
        hands.push({ lm: lm as Landmark[], side });
        const g = classifyGesture(lm as Landmark[]);
        newGesture[side] = g;
        const r =
          side === "left"
            ? pinchL.current.update(lm, now)
            : pinchR.current.update(lm, now);
        if (side === "left") pl = r;
        else pr = r;
      });

      setHandCount(hands.length);
      setGesture(newGesture);
      onFrameRef.current?.({
        hands,
        pinches: { left: pl, right: pr },
        gestures: newGesture,
        now,
      });
    });

    handsRef.current = hi;

    const loop = () => {
      animRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      if (!v || v.readyState < 2 || sendingRef.current) return;
      sendingRef.current = true;
      hi.send({ image: v })
        .then(() => {
          sendingRef.current = false;
        })
        .catch(() => {
          sendingRef.current = false;
        });
    };
    loop();

    setStarted(true);
    setLoading(false);
  }, [videoRef, options, cdn]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    handsRef.current?.close();
    handsRef.current = null;
    startedRef.current = false;
    setStarted(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      handsRef.current?.close();
    };
  }, []);

  return { start, stop, started, loading, fps, handCount, gesture };
}
