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
