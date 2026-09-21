import type { Landmark } from "./types";

/**
 * Detects a hand drawn in a circle, the sling-ring gesture.
 *
 * WHY THIS IS NOT IN gestures.ts. `classifyGesture` reads a single frame: it
 * asks which fingers are extended right now. A circle does not exist in one
 * frame. It is a path through time, so it needs state, and state is why this
 * is a class rather than a function.
 *
 * HOW IT WORKS: TOTAL TURNING ANGLE. Take consecutive segments of the path
 * and sum the signed angle from one to the next. A closed loop turns through
 * 2*PI no matter where it sits, how big it is, or what shape it is. A straight
 * line turns through nothing.
 *
 * WHY NOT ANGLE ABOUT A CENTRE. The first version of this did exactly that:
 * take the centroid of a sliding window of points and accumulate each point's
 * angle about it. It failed its own "fires on a full circle" test, and the
 * reason is worth keeping. The centroid of a PARTIAL arc is not the centre of
 * the circle, it sits inside the arc and slides forward as you draw, so the
 * angle is being measured about a moving origin and never sums to 2*PI.
 * Widening the window does not fix it, it only changes which part of the
 * gesture is wrong. Turning angle needs no origin, so the problem disappears
 * rather than getting tuned.
 *
 * A least-squares circle fit would also have been wrong, for a different
 * reason: it answers "are these points on a circle", and a hand held still on
 * the rim of an imaginary circle fits perfectly while having drawn nothing.
 *
 * THE JITTER TRAP. Segment direction is meaningless when the segment is a
 * pixel long, so short segments produce uniformly random turns. Summing those
 * is a random walk that eventually crosses any threshold. Segments below
 * `minSegment` are therefore dropped entirely rather than smoothed, which is
 * also what makes a stationary hand read as no gesture instead of a slow one.
 *
 * Centre and radius are still reported, because the caller needs somewhere to
 * put the portal, but nothing in the detection depends on them.
 */

export interface CircleGestureOptions {
  /**
   * Radians of accumulated turning before the gesture fires. Default 5.35,
   * about 306 degrees: a circle you can close casually rather than one you
   * have to land precisely, since the hand nearly always stops short.
   */
  sweepThreshold?: number;
  /** Trail length in samples. Default 48. Only affects centre and radius. */
  trailLength?: number;
  /**
   * Shortest segment, in normalized units, that carries a usable direction.
   * Default 0.006. Anything shorter is dropped, not smoothed. See THE JITTER
   * TRAP above.
   */
  minSegment?: number;
  /**
   * Largest per-segment turn that still counts as an arc. Default PI/3. A
   * sharper corner than this is a zigzag or a tracking glitch and resets.
   */
  maxTurn?: number;
  /** Discard the trail after this many ms with no sample. Default 400. */
  staleMs?: number;
}

export interface CircleProgress {
  /** 0 to 1, how much of the required sweep has been travelled. */
  progress: number;
  /** Signed sweep in radians. Positive is clockwise on screen. */
  sweep: number;
  /** Centre of the trail, normalized coords, or null with too few samples. */
  center: { x: number; y: number } | null;
  /** Mean radius of the trail in normalized units. */
  radius: number;
  /** True on the single frame the circle completes. */
  completed: boolean;
  /** Direction, once there is enough sweep to tell. */
  direction: "cw" | "ccw" | null;
}

const EMPTY: CircleProgress = {
  progress: 0,
  sweep: 0,
  center: null,
  radius: 0,
  completed: false,
  direction: null,
};

interface Sample {
  x: number;
  y: number;
  t: number;
}

export class CircleGestureDetector {
  private trail: Sample[] = [];
  private sweep = 0;
  private lastT = 0;
  private readonly o: Required<CircleGestureOptions>;

  constructor(options: CircleGestureOptions = {}) {
    this.o = {
      sweepThreshold: options.sweepThreshold ?? 5.35,
      trailLength: options.trailLength ?? 48,
      minSegment: options.minSegment ?? 0.006,
      maxTurn: options.maxTurn ?? Math.PI / 3,
      staleMs: options.staleMs ?? 400,
    };
  }

  /** Feed one frame. Pass null when the hand is gone. */
  update(lm: Landmark[] | null | undefined, now = Date.now()): CircleProgress {
    if (!lm || lm.length < 21) {
      this.reset();
      return EMPTY;
    }
    // Index fingertip. Pointing is how anybody draws a circle in the air, and
    // the wrist barely moves during the gesture, so it is the only landmark
    // with enough travel to measure.
    return this.push(lm[8].x, lm[8].y, now);
  }

  /** Feed a raw point, for tests and for non-MediaPipe sources. */
  push(x: number, y: number, now = Date.now()): CircleProgress {
    if (this.lastT && now - this.lastT > this.o.staleMs) this.reset();
    this.lastT = now;

    const prev = this.trail[this.trail.length - 1];
    if (prev) {
      // Drop segments too short to have a meaningful direction. See THE
      // JITTER TRAP. This is a hard drop, not a smooth: the sample is not
      // recorded at all, so the next real move measures from the last real
      // position rather than from noise.
      if (Math.hypot(x - prev.x, y - prev.y) < this.o.minSegment) {
        return this.report();
      }
    }

    this.trail.push({ x, y, t: now });
    if (this.trail.length > this.o.trailLength) this.trail.shift();

    const n = this.trail.length;
    if (n >= 3) {
      const a = this.trail[n - 3];
      const b = this.trail[n - 2];
      const c = this.trail[n - 1];
      const v1x = b.x - a.x;
      const v1y = b.y - a.y;
      const v2x = c.x - b.x;
      const v2y = c.y - b.y;
      // Signed angle from v1 to v2. atan2(cross, dot) is already folded into
      // (-PI, PI], so there is no seam to cross and no wraparound to handle.
      const turn = Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y);

      if (Math.abs(turn) > this.o.maxTurn) {
        // A corner this sharp is a zigzag or a tracking glitch, not an arc.
        this.sweep = 0;
      } else if (this.sweep !== 0 && Math.sign(turn) !== Math.sign(this.sweep)) {
        // Reversing restarts rather than cancels. Cancelling lets a vigorous
        // back-and-forth wave creep over the threshold given enough
        // asymmetry, and that wave is the most common thing a person does at
        // a camera.
        this.sweep = turn;
      } else {
        this.sweep += turn;
      }
    }

    const done = Math.abs(this.sweep) >= this.o.sweepThreshold;
    const out = this.report(done);
    if (done) {
      // Consume it, so the caller gets exactly one completed frame per circle
      // and needs no debounce of its own.
      this.sweep = 0;
      this.trail = [];
    }
    return out;
  }

  private report(completed = false): CircleProgress {
    if (this.trail.length < 3) {
      return { ...EMPTY, completed: false };
    }
    const center = this.centroid();
    const radii = this.trail.map((q) => Math.hypot(q.x - center.x, q.y - center.y));
    const radius = radii.reduce((a, b) => a + b, 0) / radii.length;
    return {
      progress: Math.min(1, Math.abs(this.sweep) / this.o.sweepThreshold),
      sweep: this.sweep,
      center,
      radius,
      completed,
      direction:
        Math.abs(this.sweep) > 0.5 ? (this.sweep > 0 ? "cw" : "ccw") : null,
    };
  }

  reset() {
    this.trail = [];
    this.sweep = 0;
    this.lastT = 0;
  }

  private centroid() {
    let x = 0;
    let y = 0;
    for (const p of this.trail) {
      x += p.x;
      y += p.y;
    }
    return { x: x / this.trail.length, y: y / this.trail.length };
  }
}
