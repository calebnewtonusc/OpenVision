import { describe, it, expect } from "vitest";
import { createScreenMap, NORMALIZED_MIRROR } from "./screen";

describe("createScreenMap", () => {
  it("mirrors x by default, the selfie view", () => {
    const m = createScreenMap({ width: 1000, height: 500 });
    expect(m.mirror).toBe(true);
    expect(m.x(0)).toBe(1000);
    expect(m.x(1)).toBe(0);
    expect(m.x(0.25)).toBe(750);
    expect(m.y(0.25)).toBe(125);
  });

  it("leaves x alone when mirror is false", () => {
    const m = createScreenMap({ width: 1000, height: 500, mirror: false });
    expect(m.x(0.25)).toBe(250);
    expect(m.y(0.25)).toBe(125);
  });

  it("point agrees with x and y, so no caller can map the axes differently", () => {
    const m = createScreenMap({ width: 1512, height: 900 });
    for (const p of [
      { x: 0.1, y: 0.9 },
      { x: 0.5, y: 0.5 },
      { x: 0.73, y: 0.02, z: -0.1 },
    ]) {
      expect(m.point(p)).toEqual({ x: m.x(p.x), y: m.y(p.y) });
    }
  });

  it("NORMALIZED_MIRROR stays in 0..1 and only flips x", () => {
    expect(NORMALIZED_MIRROR.point({ x: 0.2, y: 0.7 })).toEqual({
      x: 0.8,
      y: 0.7,
    });
  });

  // The bug class this exists for: a hand moving right in the camera image
  // moves LEFT on a mirrored screen. If any surface forgets that, its cursor
  // and its drawing travel in opposite directions.
  it("a hand moving right in the image moves left on screen", () => {
    const m = createScreenMap({ width: 800, height: 600 });
    expect(m.x(0.6)).toBeLessThan(m.x(0.4));
  });
});
