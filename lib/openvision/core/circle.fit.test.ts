import { describe, it, expect } from "vitest";
import { CircleGestureDetector } from "./circle";

/**
 * The portal must land on the circle the person drew. The centroid of a path
 * is not that: it sits inside the arc, pulled toward wherever the samples are
 * densest, and a hand always stops short and always slows on one side.
 */
function sweep(
  d: CircleGestureDetector,
  { cx, cy, r, arc = Math.PI * 2, steps = 70, noise = 0.005, from = 0 },
) {
  let last;
  for (let i = 0; i <= steps; i++) {
    const a = from + (arc * i) / steps;
    last = d.push(
      cx + Math.cos(a) * r + (Math.random() - 0.5) * noise,
      cy + Math.sin(a) * r + (Math.random() - 0.5) * noise,
      1000 + i * 33,
    );
    if (last.completed) break;
  }
  return last!;
}

function centroidOf(cx: number, cy: number, r: number, arc: number) {
  // Analytic centroid of a uniform arc, for comparison. Pulled toward the
  // arc's midpoint by r*sin(arc/2)/(arc/2).
  const pull = arc === 0 ? r : (r * Math.sin(arc / 2)) / (arc / 2);
  return { x: cx + Math.cos(arc / 2) * pull, y: cy + Math.sin(arc / 2) * pull };
}

describe("circle fit", () => {
  it("recovers the centre of a partial arc, where the centroid cannot", () => {
    const cx = 0.35, cy = 0.62, r = 0.13, arc = Math.PI * 1.2;
    let sumErr = 0;
    for (let t = 0; t < 20; t++) {
      const res = sweep(new CircleGestureDetector(), { cx, cy, r, arc, steps: 50 });
      sumErr += Math.hypot(res.center!.x - cx, res.center!.y - cy);
    }
    const fitErr = sumErr / 20;
    const cent = centroidOf(cx, cy, r, arc);
    const centroidErr = Math.hypot(cent.x - cx, cent.y - cy);
    console.log(
      `  216 deg arc: fit off by ${fitErr.toFixed(4)}, centroid would be off by ${centroidErr.toFixed(4)}`,
    );
    expect(fitErr).toBeLessThan(0.025);
    expect(fitErr).toBeLessThan(centroidErr / 2);
  });

  it("recovers centre and radius at completion", () => {
    const cx = 0.42, cy = 0.55, r = 0.14;
    let ce = 0, re = 0;
    for (let t = 0; t < 20; t++) {
      const res = sweep(new CircleGestureDetector(), { cx, cy, r });
      expect(res.completed).toBe(true);
      ce += Math.hypot(res.center!.x - cx, res.center!.y - cy);
      re += Math.abs(res.radius - r);
    }
    console.log(`  full circle: centre off ${(ce / 20).toFixed(4)}, radius off ${(re / 20).toFixed(4)}`);
    expect(ce / 20).toBeLessThan(0.02);
    expect(re / 20).toBeLessThan(0.02);
  });

  it("works for a circle drawn anywhere on screen", () => {
    for (const [cx, cy] of [[0.2, 0.25], [0.8, 0.3], [0.5, 0.8], [0.75, 0.7]]) {
      const res = sweep(new CircleGestureDetector(), { cx, cy, r: 0.11 });
      const err = Math.hypot(res.center!.x - cx, res.center!.y - cy);
      expect(err, `centre (${cx},${cy}) off by ${err.toFixed(4)}`).toBeLessThan(0.03);
    }
  });

  it("recovers a small circle's radius, not an inflated one", () => {
    const res = sweep(new CircleGestureDetector(), { cx: 0.5, cy: 0.5, r: 0.06, noise: 0.004 });
    expect(res.radius).toBeGreaterThan(0.035);
    expect(res.radius).toBeLessThan(0.09);
  });

  it("never returns a centre off screen, even on a nearly straight path", () => {
    const d = new CircleGestureDetector();
    let last;
    for (let i = 0; i < 40; i++) {
      last = d.push(0.2 + i * 0.012, 0.5 + (Math.random() - 0.5) * 0.004, 1000 + i * 33);
    }
    expect(last!.center!.x).toBeGreaterThan(-0.5);
    expect(last!.center!.x).toBeLessThan(1.5);
    expect(last!.center!.y).toBeGreaterThan(-0.5);
    expect(last!.center!.y).toBeLessThan(1.5);
  });
});
