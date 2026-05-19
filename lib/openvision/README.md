# OpenVision Toolkit

Spatial computing primitives for the web. Drop into any React/Next.js app to add eye tracking, hand tracking, pinch gestures, gaze cursors, and dwell-to-click. Everything runs on-device. Nothing leaves the browser.

## Layout

```
lib/openvision/
├── core/            zero-React, zero-dependency logic
│   ├── pinch.ts        PinchDetector class + PinchResult
│   ├── gestures.ts     classifyGesture, GESTURE_LABELS
│   ├── skeleton.ts     HAND_CONNECTIONS, FINGER_TIPS
│   └── types.ts        Landmark, HandData, HandSide, GestureName
└── react/           React hooks and components
    ├── useHandTracking.ts   MediaPipe Hands wrapped as a hook
    ├── useGazeTracking.ts   WebGazer wrapped as a hook
    ├── usePinchScroll.ts    bind pinch dragging to a scrollable element
    ├── useDwellClick.ts     stare to click
    ├── GazeCursor.tsx       floating cursor + dwell ring
    └── SpatialPanel.tsx     draggable glass panel with gaze focus ring
```

Import from the barrel:

```ts
import {
  PinchDetector,
  classifyGesture,
  useHandTracking,
  useGazeTracking,
  usePinchScroll,
  useDwellClick,
  GazeCursor,
  SpatialPanel,
} from "@/lib/openvision";
```

## Minimum viable hand tracking

```tsx
"use client";
import { useRef } from "react";
import { useHandTracking } from "@/lib/openvision";

export function Demo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { start, started, handCount, gesture, fps } = useHandTracking({
    videoRef,
    onFrame: (frame) => {
      // frame.hands: HandData[]
      // frame.pinches: { left, right }   (PinchResult per hand)
      // frame.gestures: { left, right }  (GestureName per hand)
    },
  });

  return (
    <>
      <video ref={videoRef} autoPlay muted playsInline />
      {!started && <button onClick={() => start()}>Start</button>}
      <div>
        {handCount} hands, {fps} fps, {gesture.left} / {gesture.right}
      </div>
    </>
  );
}
```

You handle the camera (`getUserMedia`) and pass the video element. The hook loads MediaPipe from CDN, runs the loop, and calls `onFrame` with landmarks + pinch + gestures.

## Pinch to scroll

```tsx
const scrollRef = useRef<HTMLDivElement>(null);
const pinchScroll = usePinchScroll({ target: scrollRef });

useHandTracking({
  videoRef,
  onFrame: (f) => {
    pinchScroll.apply(f.pinches.left);
    pinchScroll.apply(f.pinches.right);
  },
});

return (
  <div ref={scrollRef} style={{ overflowY: "auto", height: "100vh" }}>
    ...
  </div>
);
```

Pinch your thumb and index finger, then move your hand up or down. The element scrolls. Pass `target: null` to scroll the window instead.

Options: `sensitivity` (default 1400), `maxStep` (default 240 px/frame), `invert` (default false: hand up = scroll down, Vision Pro feel), `enabled`.

## Eye tracking + dwell to click

```tsx
const dwell = useDwellClick({ dwellMs: 1200 });
const {
  start: startGaze,
  started,
  gaze,
} = useGazeTracking({
  onSample: (s) => dwell.feed(s),
});

return (
  <>
    {started && (
      <GazeCursor x={gaze.x} y={gaze.y} dwellProgress={dwell.dwellProgress} />
    )}
    <button data-gaze-target onClick={() => alert("clicked by stare")}>
      Stare at me for 1.2s
    </button>
  </>
);
```

Tag any element with `data-gaze-target` and it becomes dwell-clickable. `useDwellClick` finds the nearest tagged element to the gaze coords, holds focus through small jitter, and fires its click handler after the dwell duration.

`useGazeTracking` also exposes a `record(x, y)` method for calibration clicks. Drive WebGazer's training by calling it for each calibration dot.

## Spatial panels

```tsx
<SpatialPanel
  id="settings"
  title="Settings"
  initialX={120}
  initialY={120}
  gazeFocused={dwell.focused?.id === "settings"}
  onClose={() => closePanel("settings")}
>
  <div>panel body</div>
</SpatialPanel>
```

Glass surface, draggable header, indigo focus ring when `gazeFocused`. Already tagged `data-gaze-target` so dwell-click works without extra wiring.

## Why an in-tree library

OpenVision is the demo site AND the toolkit. The same primitives that ship `openvision.vercel.app` are importable from any project in this repo, or copyable into a new project. No publish step, no version mismatch between demo and library, no separate place to fix bugs.

When the toolkit matures into a standalone npm package, the `core/` folder ports cleanly (no React deps) and the `react/` folder becomes the React adapter.

All glory to God! ✝️❤️
