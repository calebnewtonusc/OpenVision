import { describe, it, expect } from "vitest";
import { classifyGesture, GESTURE_LABELS } from "./gestures";
import type { Landmark } from "./types";

/**
 * Build a synthetic 21-landmark hand. The classifier inspects:
 *   - thumb extension: dist(4,0) vs dist(3,0)
 *   - finger extension: tip.y < proximal.y (index 6, mid 10, ring 14, pinky 18)
 *   - pinch ratio: dist(4,8) / dist(0,9)
 *
 * Higher y means lower on screen. "Extended" finger = tip above proximal.
 */
function hand(opts: {
  thumb?: boolean;
  index?: boolean;
  middle?: boolean;
  ring?: boolean;
  pinky?: boolean;
  pinchThumbIndex?: boolean;
}): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({
    x: 0,
    y: 0,
    z: 0,
  }));
  lm[0] = { x: 0.5, y: 0.9, z: 0 }; // wrist (bottom of frame)
  lm[9] = { x: 0.5, y: 0.55, z: 0 }; // middle base

  // Thumb: index 4 (tip) farther from wrist than 3 (joint) when extended
  if (opts.thumb) {
    lm[3] = { x: 0.42, y: 0.7, z: 0 };
    lm[4] = { x: 0.3, y: 0.6, z: 0 };
  } else {
    lm[3] = { x: 0.5, y: 0.75, z: 0 };
    lm[4] = { x: 0.5, y: 0.78, z: 0 };
  }

  // Finger pairs: [tip, proximal]. Extended = tip.y < proximal.y
  const fingers: [number, number, boolean | undefined][] = [
    [8, 6, opts.index],
    [12, 10, opts.middle],
    [16, 14, opts.ring],
    [20, 18, opts.pinky],
  ];
  for (const [tip, prox, ext] of fingers) {
    lm[prox] = { x: 0.5, y: 0.55, z: 0 };
    lm[tip] = ext ? { x: 0.5, y: 0.3, z: 0 } : { x: 0.5, y: 0.6, z: 0 };
  }

  // Pinch override: bring thumb (4) and index (8) close together
  if (opts.pinchThumbIndex) {
    lm[4] = { x: 0.5, y: 0.5, z: 0 };
    lm[8] = { x: 0.51, y: 0.5, z: 0 };
  }

  return lm;
}

describe("classifyGesture", () => {
  it("returns 'none' for null/empty landmarks", () => {
    expect(classifyGesture(null)).toBe("none");
    expect(classifyGesture([])).toBe("none");
    expect(classifyGesture(undefined)).toBe("none");
  });

  it("returns 'none' for fewer than 21 landmarks", () => {
    expect(classifyGesture([{ x: 0, y: 0, z: 0 }])).toBe("none");
  });

  it("classifies fist (no fingers extended)", () => {
    expect(classifyGesture(hand({}))).toBe("fist");
  });

  it("classifies open (all 5 extended)", () => {
    expect(
      classifyGesture(
        hand({
          thumb: true,
          index: true,
          middle: true,
          ring: true,
          pinky: true,
        }),
      ),
    ).toBe("open");
  });

  it("classifies point (only index extended)", () => {
    expect(classifyGesture(hand({ index: true }))).toBe("point");
  });

  it("classifies peace (index + middle extended)", () => {
    expect(classifyGesture(hand({ index: true, middle: true }))).toBe("peace");
  });

  it("classifies thumbs_up (only thumb extended)", () => {
    expect(classifyGesture(hand({ thumb: true }))).toBe("thumbs_up");
  });

  it("classifies pinky (only pinky extended)", () => {
    expect(classifyGesture(hand({ pinky: true }))).toBe("pinky");
  });

  it("classifies pinch when thumb and index tips are very close", () => {
    expect(classifyGesture(hand({ pinchThumbIndex: true }))).toBe("pinch");
  });

  it("pinch beats other classifications when thumb-index are close", () => {
    // Even with 4 fingers extended, if thumb-index is close it's a pinch.
    expect(
      classifyGesture(
        hand({
          thumb: true,
          index: true,
          middle: true,
          ring: true,
          pinky: true,
          pinchThumbIndex: true,
        }),
      ),
    ).toBe("pinch");
  });

  it("classifies almost_open (4 fingers extended, not pinching)", () => {
    expect(
      classifyGesture(
        hand({ thumb: true, index: true, middle: true, ring: true }),
      ),
    ).toBe("almost_open");
  });
});

describe("GESTURE_LABELS", () => {
  it("has a label for every gesture name returned by classifyGesture", () => {
    const allGestures = [
      "none",
      "fist",
      "open",
      "point",
      "peace",
      "thumbs_up",
      "pinky",
      "pinch",
      "almost_open",
      "custom",
    ] as const;
    for (const g of allGestures) {
      expect(GESTURE_LABELS[g]).toBeDefined();
    }
  });
});
