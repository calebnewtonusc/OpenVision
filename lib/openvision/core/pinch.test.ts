import { describe, it, expect } from "vitest";
import { PinchDetector } from "./pinch";

// Synthetic 21-landmark hand poses. Only the indices PinchDetector touches
// matter: 0 (wrist), 4 (thumb tip), 5 (index base), 8 (index tip), 9 (middle
// base), 17 (pinky base). All others are stubs.
function hand(opts: {
  thumb: [number, number];
  index: [number, number];
  /** palm size scale; controls lm[0] vs lm[9] distance */
  palm?: number;
}) {
  const palm = opts.palm ?? 0.2;
  const lm = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  // wrist at (0.5, 0.5)
  lm[0] = { x: 0.5, y: 0.5, z: 0 };
  // middle base directly above wrist at distance `palm` (=> palm height)
  lm[9] = { x: 0.5, y: 0.5 - palm, z: 0 };
  // index base + pinky base equidistant left/right of middle base
  lm[5] = { x: 0.5 + palm * 0.5, y: 0.5 - palm * 0.6, z: 0 };
  lm[17] = { x: 0.5 - palm * 0.5, y: 0.5 - palm * 0.6, z: 0 };
  lm[4] = { x: opts.thumb[0], y: opts.thumb[1], z: 0 };
  lm[8] = { x: opts.index[0], y: opts.index[1], z: 0 };
  return lm;
}

const OPEN = () => hand({ thumb: [0.3, 0.6], index: [0.7, 0.6] }); // thumb-index distance ~0.4
const PINCHED = () => hand({ thumb: [0.5, 0.6], index: [0.51, 0.6] }); // distance ~0.01

describe("PinchDetector", () => {
  it("starts in idle state", () => {
    const d = new PinchDetector();
    expect(d.state).toBe("idle");
  });

  it("returns idle + lost when given null landmarks", () => {
    const d = new PinchDetector();
    const r = d.update(null);
    expect(r.state).toBe("idle");
    expect(r.lost).toBe(true);
    expect(r.center).toBe(null);
  });

  it("returns idle + lost when given fewer than 21 landmarks", () => {
    const d = new PinchDetector();
    const r = d.update([{ x: 0, y: 0, z: 0 }]);
    expect(r.state).toBe("idle");
    expect(r.lost).toBe(true);
  });

  it("transitions idle → pinching when ratio drops below enterRatio", () => {
    const d = new PinchDetector();
    const r1 = d.update(OPEN(), 0);
    expect(r1.state).toBe("idle");
    expect(r1.isPinched).toBe(false);

    const r2 = d.update(PINCHED(), 16);
    expect(r2.state).toBe("pinching");
    expect(r2.changed).toBe(true);
    expect(r2.isPinched).toBe(true);
  });

  it("uses hysteresis: stays pinched until ratio exceeds exitRatio", () => {
    const d = new PinchDetector({ enterRatio: 0.38, exitRatio: 0.52 });
    d.update(OPEN(), 0);
    d.update(PINCHED(), 16);
    expect(d.state).toBe("pinching");

    // Pose with ratio between enterRatio and exitRatio: should stay pinched
    const between = hand({ thumb: [0.45, 0.6], index: [0.55, 0.6] });
    const r = d.update(between, 32);
    expect(["pinching", "holding", "dragging"]).toContain(r.state);

    // Fully open: should release
    const r2 = d.update(OPEN(), 48);
    expect(r2.state).toBe("released");
    expect(r2.changed).toBe(true);
  });

  it("transitions pinching → holding after holdMs of no movement", () => {
    const d = new PinchDetector({ holdMs: 100, dragDeadzone: 1.0 });
    d.update(OPEN(), 0);
    d.update(PINCHED(), 0);
    const r = d.update(PINCHED(), 200);
    expect(r.state).toBe("holding");
    expect(r.heldMs).toBeGreaterThanOrEqual(100);
  });

  it("transitions pinching → dragging when pinch center moves past deadzone", () => {
    const d = new PinchDetector({ dragDeadzone: 0.001 });
    d.update(OPEN(), 0);
    d.update(PINCHED(), 16);
    // Same pinch but shifted right
    const shifted = hand({ thumb: [0.7, 0.6], index: [0.71, 0.6] });
    const r = d.update(shifted, 32);
    expect(r.state).toBe("dragging");
  });

  it("released state transitions to idle on next frame", () => {
    const d = new PinchDetector();
    d.update(OPEN(), 0);
    d.update(PINCHED(), 16);
    d.update(OPEN(), 32);
    expect(d.state).toBe("released");
    const r = d.update(OPEN(), 48);
    expect(r.state).toBe("idle");
    expect(r.changed).toBe(true);
  });

  it("smooths the pinch center across frames (EMA)", () => {
    const d = new PinchDetector();
    d.update(PINCHED(), 0);
    const c1 = d.center;
    // Jump the pinch to a new position
    const shifted = hand({ thumb: [0.9, 0.6], index: [0.91, 0.6] });
    d.update(shifted, 16);
    const c2 = d.center;
    // Smoothed center should be between c1 and the new raw position, not exactly at it
    expect(c2!.x).toBeGreaterThan(c1!.x);
    expect(c2!.x).toBeLessThan(0.91);
  });

  it("reports delta as the per-frame change in smoothed center", () => {
    const d = new PinchDetector();
    d.update(PINCHED(), 0);
    const shifted = hand({ thumb: [0.55, 0.6], index: [0.56, 0.6] });
    const r = d.update(shifted, 16);
    expect(r.delta.x).toBeGreaterThan(0);
  });
});
