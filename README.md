# OpenVision

Apple Vision Pro-style spatial computing — running entirely in your browser. No headset, no app, no install. Just a camera.

Live: [openvision.vercel.app](https://openvision.vercel.app) *(connect to Vercel)*

---

## What is OpenVision?

OpenVision simulates the core interaction paradigms of Apple Vision Pro using only a webcam and a browser. Eye tracking, hand tracking, pinch gestures, spatial panels — all running on-device via WebGL and WebAssembly. Nothing ever leaves your browser.

### Why it matters

Apple Vision Pro demos require a $3,500 headset and an Apple Store appointment. OpenVision lets anyone experience spatial computing from any device with a camera — Windows, Mac, Chromebook, anything.

---

## Features

### VisionWeb (`/vision`)

Eye tracking powered by [WebGazer.js](https://webgazer.cs.brown.edu/) (Brown University).

- 9-point calibration (matches official WebGazer methodology — 5 clicks per dot, 45 total samples)
- Real-time gaze cursor with Kalman filter smoothing
- Face detection feedback during calibration (green = detected, red = not)
- Dwell-to-click: look at any target for 1.2 seconds to activate
- Spatial panel system — panels float in 3D space, draggable, closeable
- Pinch gesture integration (index + thumb close = click)
- Hand tracking via MediaPipe (scroll, drag, interact)

### HandsWeb (`/hands`)

Hand tracking powered by [MediaPipe Hands](https://developers.google.com/mediapipe/solutions/vision/hand_landmarker) (Google) — 21 landmarks per hand at 30fps+.

**4 interactive modes:**

| Mode | What it does |
|---|---|
| **Particles** | Every fingertip emits glowing particles with gravity. Z-depth controls energy. |
| **Draw** | Point with index finger to paint smooth bezier curves. Open palm to clear. |
| **Bubbles** | Iridescent bubbles float up. Pop them with your fingertips. |
| **Portal** | Hands glow through a pulsing void. Fingertips trail upward particles. |

Real-time gesture recognition: Fist, Open, Point, Peace, Thumbs Up, Pinch, and more — labeled live on wrists.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Eye Tracking | WebGazer.js 2.1.0 (Brown University) |
| Hand Tracking | MediaPipe Hands v0.4 (Google) |
| Pinch Detection | Custom `PinchDetector` class (Verlet-smoothed, hysteresis thresholds) |
| Styling | Tailwind CSS v4 |
| Deployment | Vercel |

---

## Architecture

### WebGazer Integration

WebGazer.js uses TF.js TFFacemesh for face landmark detection, then trains a ridge regression model mapping face features to screen coordinates. Key implementation details:

- `saveDataAcrossSessions(false)` — prevents stale data from prior sessions corrupting the model
- `setRegression('ridge')` — correct API name in 2.1.0 (not `'ridgeReg'`)
- `applyKalmanFilter(true)` — built-in smoothing, better than manual EMA
- Auto click-recording stays ON during calibration — this is how WebGazer is designed
- `removeMouseEventListeners()` after calibration — the only correct way to stop online learning in 2.1.0

### PinchDetector (`hooks/usePinch.ts`)

Custom class with:
- Normalized thumb-index distance ratio (relative to palm scale, so it works at any distance from camera)
- Separate enter/exit thresholds (hysteresis prevents jitter at the boundary)
- State machine: `idle` → `pinching` → `holding` | `dragging` → `released` → `idle`
- EMA smoothing on center position (alpha = 0.4)
- Drag deadzone (0.012 normalized units) to prevent accidental drags on pinch

### MediaPipe Hands

Loaded via CDN script tag — more reliable than ES module import for WASM-based libraries. Avoids CDN WASM/JS version mismatch. Results fire at camera frame rate (~30fps). Hand landmarks are normalized 0-1 relative to the video frame.

---

## Project Structure

```
openvision/
├── app/
│   ├── page.tsx              # Landing — links to /vision and /hands
│   ├── vision/page.tsx       # Lazy-loads VisionWeb (avoids SSR browser API crash)
│   ├── hands/page.tsx        # Lazy-loads HandsWeb
│   └── layout.tsx
├── components/
│   ├── VisionWeb.tsx         # Eye tracking + spatial panel interface
│   ├── HandsWeb.tsx          # Hand tracking sandbox (4 modes)
│   └── SpatialPanel.tsx      # Draggable spatial panel primitive
└── hooks/
    └── usePinch.ts           # PinchDetector class
```

---

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Requires:** HTTPS or localhost (browser camera API requires secure context). On production, Vercel provides HTTPS automatically.

---

## Calibration Guide

For best eye tracking accuracy:

1. Sit 50-70cm from your screen (arm's length)
2. Keep your head still during calibration
3. Watch the face preview in the bottom-right corner — the box must be green (face detected)
4. Look directly at each dot before clicking. Keep your eyes on the dot, not the cursor.
5. Click each dot 5 times without moving your head

Poor lighting and head movement during calibration are the primary causes of inaccuracy.

---

## Roadmap

Next modes planned for HandsWeb:

- **WebGL Fluid** — Port PavelDoGreat/WebGL-Fluid-Simulation. Fingertips = fluid injectors.
- **SDF Metaballs** — Fullscreen GLSL shader. Fingertips merge like liquid.
- **Theremin** — Tone.js audio synthesis. Hand height = pitch, pinch = volume.
- **Cloth Simulation** — Verlet grid. Hand grabs and tears fabric.
- **3D Particle Morph** — Three.js. 60k+ GPU particles morphing between shapes.
- **Falling Sand** — Cellular automata. Pour sand, water, fire, lava with gestures.

---

## Privacy

No data ever leaves your browser. Camera feed is processed entirely on-device via WebAssembly. No server, no storage, no analytics.

---

All glory to God! ✝️❤️
