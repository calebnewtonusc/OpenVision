import { describe, it, expect } from "vitest";
import {
  pointingPoint, cameraSpace, depthFromApparentSize, focalNormalized,
  rayToScreen, mmToPixels, MACBOOK_14, MAC_CAMERA, DEFAULT_ANTHRO,
  type Vec3,
} from "./pointing";
import type { Landmark } from "./types";

/**
 * Project a hand from a KNOWN 3D position into image coordinates.
 *
 * The first version of these helpers made up plausible-looking image spans
 * directly, and one of them implied a hand 1.9 metres away, BEHIND the head.
 * Three tests failed and the code was right in all three: it refused to cast
 * a ray through a fingertip further off than the eye. Generating the image
 * from a real geometry makes that class of bad fixture impossible, and lets
 * the tests assert that the recovered depth matches the truth it came from.
 */
function project(xMm: number, yMm: number, zMm: number) {
  const f = focalNormalized(MAC_CAMERA);
  return {
    x: 0.5 + (xMm * f) / zMm,
    y: 0.5 - (yMm * f * MAC_CAMERA.aspect) / zMm,
  };
}

/** A hand at a real position, with a real palm, seen by the camera. */
function handAt(xMm: number, yMm: number, zMm: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const mcp = project(xMm, yMm, zMm);
  const wrist = project(xMm, yMm - DEFAULT_ANTHRO.palmMm, zMm);
  lm[9] = { x: mcp.x, y: mcp.y, z: 0 };
  lm[0] = { x: wrist.x, y: wrist.y, z: 0 };
  lm[8] = { x: mcp.x, y: mcp.y, z: 0 };
  return lm;
}

/** A face at a real position, with a real IPD. */
function eyesAt(xMm: number, yMm: number, zMm: number) {
  const half = DEFAULT_ANTHRO.ipdMm / 2;
  return {
    leftEye: project(xMm - half, yMm, zMm),
    rightEye: project(xMm + half, yMm, zMm),
  };
}

/** Pixels back to camera-space millimetres, to check the ray in 3D. */
function pixelsToMm(x: number, y: number) {
  const s = MACBOOK_14;
  return {
    x: (x / s.widthPx) * s.widthMm - s.cameraXMm,
    y: -((y / s.heightPx) * s.heightMm) - s.cameraYMm,
  };
}

describe("depth from apparent size", () => {
  it("is inverse in distance: twice as far looks half as big", () => {
    const near = depthFromApparentSize(63, 0.08, MAC_CAMERA);
    const far = depthFromApparentSize(63, 0.04, MAC_CAMERA);
    expect(far / near).toBeCloseTo(2, 6);
  });

  it("puts a normal seated distance in a believable range", () => {
    // 63mm of IPD spanning 6% of the image width.
    const d = depthFromApparentSize(63, 0.06, MAC_CAMERA);
    expect(d).toBeGreaterThan(400);
    expect(d).toBeLessThan(1400);
  });

  it("reports Infinity rather than a huge number for a degenerate span", () => {
    expect(depthFromApparentSize(63, 0, MAC_CAMERA)).toBe(Infinity);
  });
});

describe("camera space", () => {
  it("puts the image centre on the optical axis", () => {
    const p = cameraSpace(0.5, 0.5, 600, MAC_CAMERA);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.z).toBe(600);
  });

  it("flips y, because image y runs down and the world runs up", () => {
    expect(cameraSpace(0.5, 0.2, 600, MAC_CAMERA).y).toBeGreaterThan(0);
    expect(cameraSpace(0.5, 0.8, 600, MAC_CAMERA).y).toBeLessThan(0);
  });

  it("scales with depth: the same pixel is further out when further away", () => {
    const near = cameraSpace(0.8, 0.5, 300, MAC_CAMERA);
    const far = cameraSpace(0.8, 0.5, 600, MAC_CAMERA);
    expect(far.x / near.x).toBeCloseTo(2, 6);
  });
});

describe("the ray", () => {
  // THE PROPERTY CALEB ASKED FOR, stated as an assertion: eye, fingertip and
  // the point on screen are one straight line.
  it("puts eye, fingertip and screen point on one straight line", () => {
    const eye: Vec3 = { x: 40, y: 20, z: 700 };
    const finger: Vec3 = { x: -30, y: -55, z: 320 };
    const px = rayToScreen(eye, finger, MACBOOK_14);
    const hit = pixelsToMm(px.x, px.y);
    const P: Vec3 = { x: hit.x, y: hit.y, z: 0 };

    // Cross product of (F-E) and (P-E) is zero when the three are collinear.
    const a = { x: finger.x - eye.x, y: finger.y - eye.y, z: finger.z - eye.z };
    const b = { x: P.x - eye.x, y: P.y - eye.y, z: P.z - eye.z };
    const cross = Math.hypot(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x,
    );
    const scale = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z);
    expect(cross / scale).toBeLessThan(1e-9);
  });

  it("lands on the camera when eye and finger are both on the axis", () => {
    const px = rayToScreen({ x: 0, y: 0, z: 700 }, { x: 0, y: 0, z: 300 }, MACBOOK_14);
    expect(px.x).toBeCloseTo(MACBOOK_14.widthPx / 2, 6);
  });

  it("falls back instead of dividing by zero when the hand is level with the face", () => {
    const px = rayToScreen({ x: 0, y: 0, z: 500 }, { x: 10, y: 10, z: 500 }, MACBOOK_14);
    expect(Number.isFinite(px.x)).toBe(true);
    expect(Number.isFinite(px.y)).toBe(true);
  });
});

describe("parallax", () => {
  // A person sitting 600mm back, hand 350mm out. Both real distances.
  const EYE_Z = 600;
  const HAND_Z = 350;

  it("recovers the depths it was given", () => {
    const r = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: handAt(0, -80, HAND_Z) })!;
    expect(r.eyeMm).toBeCloseTo(EYE_Z, 0);
    expect(r.fingerMm).toBeCloseTo(HAND_Z, 0);
    expect(r.fingerMm).toBeLessThan(r.eyeMm);
  });

  // The whole point of the exercise. Lean left and the same fingertip points
  // further right, because your eye moved and your finger did not.
  it("moving the eye LEFT moves the point RIGHT", () => {
    const h = handAt(0, -80, HAND_Z);
    const centred = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: h })!;
    const leaned = pointingPoint({ ...eyesAt(-90, 0, EYE_Z), hand: h })!;
    expect(leaned.x).toBeGreaterThan(centred.x);
  });

  it("moving the finger right moves the point right", () => {
    const e = eyesAt(0, 0, EYE_Z);
    const a = pointingPoint({ ...e, hand: handAt(-60, -80, HAND_Z) })!;
    const b = pointingPoint({ ...e, hand: handAt(60, -80, HAND_Z) })!;
    expect(b.x).toBeGreaterThan(a.x);
  });

  // A camera-relative mapping cannot do this: with the finger held still it
  // returns the same point wherever the head goes. That is the bug.
  it("differs from the camera-relative answer once the head moves", () => {
    const h = handAt(0, -80, HAND_Z);
    const a = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: h })!;
    const b = pointingPoint({ ...eyesAt(-120, 0, EYE_Z), hand: h })!;
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(20);
  });

  it("points where the finger is when the eye is directly behind it", () => {
    // Eye, finger and target on one vertical line through the camera axis.
    const r = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: handAt(0, -80, HAND_Z) })!;
    expect(r.x).toBeCloseTo(MACBOOK_14.widthPx / 2, 0);
  });
});

describe("the ray must never fly off screen", () => {
  // Caleb, 2026-09-21: "The portal keeps randomly starting on random parts
  // of the screen that totally have nothing to do with where my pinch is."
  //
  // t = eyeZ / (eyeZ - fingerZ). As the hand nears the plane of the face
  // that denominator vanishes and t explodes, so a 10mm fingertip movement
  // became 600mm on screen. Both depths are estimated from apparent size
  // and both are noisy, so the hand's estimate wanders into that zone by
  // itself. Guarding against zero was not enough: the numbers were finite
  // and absurd.
  const EYE_Z = 600;

  it("does not explode when the hand is near the face plane", () => {
    for (const handZ of [599, 595, 590, 580, 560, 520]) {
      const r = pointingPoint({
        ...eyesAt(0, 0, EYE_Z), hand: handAt(40, -80, handZ),
      })!;
      expect(r, `handZ=${handZ}`).not.toBeNull();
      // Generously off screen is still a bug: the screen is 1512 wide.
      expect(Math.abs(r.x), `handZ=${handZ} x=${r.x}`).toBeLessThan(6000);
      expect(Math.abs(r.y), `handZ=${handZ} y=${r.y}`).toBeLessThan(6000);
    }
  });

  it("stays put as the hand depth wobbles, which it always does", () => {
    // A hand held still, with the depth estimate drifting by noise. The
    // point must not swing across the display.
    const xs: number[] = [];
    for (const handZ of [340, 350, 360, 370, 355, 345]) {
      xs.push(pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: handAt(0, -80, handZ) })!.x);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread, `x swung ${spread.toFixed(0)}px on depth noise alone`)
      .toBeLessThan(400);
  });

  it("falls back rather than extrapolating past the gain limit", () => {
    // Hand 10mm in front of the face: the old code multiplied every offset
    // by 60.
    const close = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: handAt(40, -80, 590) })!;
    const camera = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: handAt(40, -80, 340) })!;
    // The fallback is the camera-relative point, which is wrong by a known
    // parallax rather than an unknown multiple, so it stays in the frame.
    expect(Math.abs(close.x)).toBeLessThan(3000);
    expect(Number.isFinite(camera.x)).toBe(true);
  });

  it("still corrects for parallax when the hand is genuinely out front", () => {
    // The guard must not disable the feature it protects.
    const h = handAt(0, -80, 350);
    const centred = pointingPoint({ ...eyesAt(0, 0, EYE_Z), hand: h })!;
    const leaned = pointingPoint({ ...eyesAt(-90, 0, EYE_Z), hand: h })!;
    expect(leaned.x).toBeGreaterThan(centred.x);
  });
});

describe("refusing to guess", () => {
  it("returns null for a short landmark array", () => {
    expect(pointingPoint({
      leftEye: { x: 0.47, y: 0.35 }, rightEye: { x: 0.53, y: 0.35 },
      hand: [{ x: 0.5, y: 0.5, z: 0 }],
    })).toBeNull();
  });

  it("returns null when the pupils coincide", () => {
    expect(pointingPoint({
      leftEye: { x: 0.5, y: 0.35 }, rightEye: { x: 0.5, y: 0.35 },
      hand: handAt(0, -80, 350),
    })).toBeNull();
  });

  it("returns null when the palm has no extent", () => {
    const flat: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(pointingPoint({
      leftEye: { x: 0.47, y: 0.35 }, rightEye: { x: 0.53, y: 0.35 },
      hand: flat,
    })).toBeNull();
  });
});

describe("sanity against the physical panel", () => {
  it("keeps a centred point near the middle of a 14 inch screen", () => {
    const r = pointingPoint({ ...eyesAt(0, 0, 600), hand: handAt(0, -80, 350) })!;
    expect(r.x).toBeGreaterThan(MACBOOK_14.widthPx * 0.3);
    expect(r.x).toBeLessThan(MACBOOK_14.widthPx * 0.7);
  });

  it("round-trips millimetres and pixels", () => {
    const px = mmToPixels(40, -70, MACBOOK_14);
    const back = pixelsToMm(px.x, px.y);
    expect(back.x).toBeCloseTo(40, 6);
    expect(back.y).toBeCloseTo(-70, 6);
  });

  it("has a focal length consistent with the stated field of view", () => {
    expect(focalNormalized({ hfovDeg: 90, aspect: 1 })).toBeCloseTo(0.5, 9);
    expect(focalNormalized(MAC_CAMERA)).toBeGreaterThan(0.9);
  });
});
