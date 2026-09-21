import { describe, it, expect } from "vitest";
import { CircleGestureDetector } from "./circle";

/** Walk a circle of `radius` about (cx, cy), `steps` samples over `sweep` radians. */
function walk(
  d: CircleGestureDetector,
  {
    steps = 40,
    sweep = Math.PI * 2,
    radius = 0.15,
    cx = 0.5,
    cy = 0.5,
    from = 0,
    t0 = 1000,
    dt = 33,
  } = {},
) {
  let last = d.push(cx + radius, cy, t0);
  for (let i = 1; i <= steps; i++) {
    const a = from + (sweep * i) / steps;
    last = d.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, t0 + i * dt);
    if (last.completed) return { result: last, completedAt: i };
  }
  return { result: last, completedAt: -1 };
}

describe("CircleGestureDetector", () => {
  it("fires on a full circle", () => {
    const { completedAt } = walk(new CircleGestureDetector());
    expect(completedAt).toBeGreaterThan(0);
  });

  it("does not fire on half a circle", () => {
    const { completedAt, result } = walk(new CircleGestureDetector(), {
      sweep: Math.PI,
    });
    expect(completedAt).toBe(-1);
    expect(result.progress).toBeLessThan(1);
  });

  // The bug this exists for: angles live on (-PI, PI], so a circle drawn
  // through the seam produces one 6.28 radian jump if you subtract raw
  // angles. That detector fires at random depending on where on screen the
  // hand happens to be, which is close to undebuggable by waving at a laptop.
  it("fires the same wherever the circle sits on the angle seam", () => {
    for (const from of [0, Math.PI * 0.99, -Math.PI * 0.99, Math.PI / 3]) {
      const { completedAt } = walk(new CircleGestureDetector(), { from });
      expect(completedAt, `start angle ${from}`).toBeGreaterThan(0);
    }
  });

  it("fires in both directions and reports which", () => {
    const cw = walk(new CircleGestureDetector());
    const ccw = walk(new CircleGestureDetector(), { sweep: -Math.PI * 2 });
    expect(cw.completedAt).toBeGreaterThan(0);
    expect(ccw.completedAt).toBeGreaterThan(0);
    expect(cw.result.direction).not.toBe(ccw.result.direction);
  });

  it("ignores a stationary hand, however long it jitters", () => {
    const d = new CircleGestureDetector();
    let r;
    for (let i = 0; i < 300; i++) {
      r = d.push(0.5 + (Math.random() - 0.5) * 0.004, 0.5 + (Math.random() - 0.5) * 0.004, 1000 + i * 33);
      expect(r.completed).toBe(false);
    }
    expect(r!.progress).toBe(0);
  });

  // A vigorous back-and-forth wave is the most common thing a person does at
  // a camera, and it must never open a portal.
  it("ignores a back and forth wave", () => {
    const d = new CircleGestureDetector();
    let t = 1000;
    for (let rep = 0; rep < 12; rep++) {
      for (const dir of [1, -1]) {
        for (let i = 0; i <= 10; i++) {
          const a = (dir * Math.PI * 0.7 * i) / 10;
          const r = d.push(0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15, (t += 33));
          expect(r.completed).toBe(false);
        }
      }
    }
  });

  it("abandons the circle after a gap, rather than joining two halves", () => {
    const d = new CircleGestureDetector();
    walk(d, { sweep: Math.PI * 0.9, steps: 20, t0: 1000 });
    // Same hand, one second later, finishing the other half.
    const { completedAt } = walk(d, {
      sweep: Math.PI * 0.9,
      steps: 20,
      from: Math.PI * 0.9,
      t0: 3000,
    });
    expect(completedAt).toBe(-1);
  });

  // The centre matters at exactly one moment: completion, which is when the
  // caller places the portal. Mid-gesture the trail is a partial arc and its
  // centroid is legitimately pulled toward that arc, so asserting the true
  // centre there would be asserting a bug.
  it("reports the true centre and radius at completion", () => {
    const d = new CircleGestureDetector();
    const { result, completedAt } = walk(d, { cx: 0.4, cy: 0.6, radius: 0.12 });
    expect(completedAt).toBeGreaterThan(0);
    expect(result.center!.x).toBeCloseTo(0.4, 1);
    expect(result.center!.y).toBeCloseTo(0.6, 1);
    expect(result.radius).toBeCloseTo(0.12, 1);
  });

  it("resets on a lost hand", () => {
    const d = new CircleGestureDetector();
    walk(d, { sweep: Math.PI * 0.9, steps: 20 });
    expect(d.update(null).progress).toBe(0);
  });

  it("consumes the completion, so one circle fires once", () => {
    const d = new CircleGestureDetector();
    const { result } = walk(d);
    expect(result.completed).toBe(true);
    // Immediately after, the detector is empty rather than still complete.
    expect(d.push(0.65, 0.5, 9_000).completed).toBe(false);
  });
});
