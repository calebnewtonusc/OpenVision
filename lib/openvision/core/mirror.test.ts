import { describe, it, expect } from "vitest";
import { mirrorAngle } from "./circle";

// The selfie mirror: normalized x runs left to right in the image, screen x
// is flipped so the user sees themselves the right way round.
const W = 1512;
const H = 900;
const mx = (nx: number) => (1 - nx) * W;
const my = (ny: number) => ny * H;

describe("mirrorAngle", () => {
  const cx = 0.45;
  const cy = 0.55;
  const r = 0.12;

  it("puts the drawn point on the same side of centre as the mapped point", () => {
    for (let i = 0; i < 24; i++) {
      const theta = (Math.PI * 2 * i) / 24;
      // Where the landmark actually appears on screen.
      const trueX = mx(cx + Math.cos(theta) * r) - mx(cx);
      const trueY = my(cy + Math.sin(theta) * r) - my(cy);
      // Where the canvas draws it using the mirrored angle.
      const phi = mirrorAngle(theta);
      const drawnX = Math.cos(phi);
      const drawnY = Math.sin(phi);
      if (Math.abs(trueX) > 1) {
        expect(Math.sign(drawnX), `theta=${theta.toFixed(2)} x side`).toBe(Math.sign(trueX));
      }
      if (Math.abs(trueY) > 1) {
        expect(Math.sign(drawnY), `theta=${theta.toFixed(2)} y side`).toBe(Math.sign(trueY));
      }
    }
  });

  // The bug, 2026-09-21: "It's going the opposite direction now lmao". The
  // arc built away from the hand because the sweep kept its normalized sign.
  it("reverses direction, so a sweep must be negated too", () => {
    const a = mirrorAngle(0.3);
    const b = mirrorAngle(0.9);
    expect(b).toBeLessThan(a);
    expect(b - a).toBeCloseTo(-(0.9 - 0.3), 10);
  });

  it("is its own inverse", () => {
    for (const t of [0, 1, -2.2, Math.PI, 3]) {
      expect(mirrorAngle(mirrorAngle(t))).toBeCloseTo(t, 10);
    }
  });
});
