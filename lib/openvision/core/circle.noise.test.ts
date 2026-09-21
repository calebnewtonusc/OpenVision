import { describe, it, expect } from "vitest";
import { CircleGestureDetector } from "./circle";

// A real hand, not a compass. MediaPipe landmarks jitter 2-4px/frame, which
// at 720p normalizes to roughly 0.003-0.006.
function noisyCircle(noise: number, steps = 60, radius = 0.15) {
  const d = new CircleGestureDetector();
  let fired = false;
  let peak = 0;
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * 2 * i) / steps;
    const r = d.push(
      0.5 + Math.cos(a) * radius + (Math.random() - 0.5) * noise,
      0.5 + Math.sin(a) * radius + (Math.random() - 0.5) * noise,
      1000 + i * 33,
    );
    peak = Math.max(peak, r.progress);
    if (r.completed) fired = true;
  }
  return { fired, peak };
}

describe("real hand input", () => {
  it("fires with realistic landmark jitter", () => {
    let hits = 0;
    let best = 0;
    for (let trial = 0; trial < 20; trial++) {
      const { fired, peak } = noisyCircle(0.006);
      if (fired) hits++;
      best = Math.max(best, peak);
    }
    console.log(`  jitter 0.006: fired ${hits}/20, best progress ${best.toFixed(2)}`);
    expect(hits).toBeGreaterThan(17);
  });

  it("fires on a small circle", () => {
    let hits = 0;
    for (let t = 0; t < 20; t++) if (noisyCircle(0.004, 60, 0.06).fired) hits++;
    console.log(`  small circle: fired ${hits}/20`);
    expect(hits).toBeGreaterThan(17);
  });

  it("fires on a fast sweep with few samples", () => {
    let hits = 0;
    for (let t = 0; t < 20; t++) if (noisyCircle(0.005, 20, 0.15).fired) hits++;
    console.log(`  fast sweep (20 samples): fired ${hits}/20`);
    expect(hits).toBeGreaterThan(17);
  });
});

describe("roundness separates an arc from a wander", () => {
  function path(points: [number, number][]) {
    const d = new CircleGestureDetector();
    let last;
    for (let i = 0; i < points.length; i++) {
      last = d.push(points[i][0], points[i][1], 1000 + i * 33);
    }
    return last!;
  }

  // A real arc: every sample the same distance from a centre.
  it("reports high roundness for an arc", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (Math.PI * 1.2 * i) / 40;
      pts.push([0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15]);
    }
    const r = path(pts);
    expect(r.roundness).toBeGreaterThan(0.6);
  });

  // THE FIRST VERSION OF THIS TEST WAS WRONG, and measuring said so. It
  // used a single sine hump and expected low roundness. Measured, that path
  // has a residual of 0.115 of its own spread: a 1.2 PI sine arc genuinely
  // IS close to a circle, so 0.78 was the correct answer and the metric was
  // being blamed for being right.
  //
  // A real non-circle is one whose distance from any centre keeps changing.
  // A spiral turns as much as an arc and is never round.
  it("reports low roundness for a spiral, which turns without being round", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 45; i++) {
      const a = (Math.PI * 1.6 * i) / 45;
      const r = 0.05 + (i / 45) * 0.22;
      pts.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]);
    }
    expect(path(pts).roundness).toBeLessThan(0.55);
  });

  it("a straight line is not round at all", () => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 30; i++) pts.push([0.2 + i * 0.02, 0.5]);
    expect(path(pts).roundness).toBeLessThan(0.3);
  });
});
