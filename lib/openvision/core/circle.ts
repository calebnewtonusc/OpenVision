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
 * THE NOISE TRAP. MediaPipe landmarks move a few pixels a frame even when
 * the hand does not, which is about 0.003 to 0.006 normalized, and the turn
 * between consecutive segments of a hand-drawn circle is only about 0.1
 * radians. So noise of that size swamps the sign of the turn. Any rule that
 * branches on `Math.sign(turn)` therefore fires at random on real input while
 * passing every test written with a compass. Smooth first, and let noise
 * cancel itself rather than trying to detect it.
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
  /** Trail length in samples. Default 240, enough to hold a whole slow
   * circle, since the fit is only as good as the arc it sees. */
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
  /**
   * Exponential smoothing on the incoming point, 0 to 1. Default 0.45.
   * Lower is smoother and laggier. See THE NOISE TRAP.
   */
  smoothing?: number;
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
  private smooth: { x: number; y: number } | null = null;
  private sweep = 0;
  private lastT = 0;
  private readonly o: Required<CircleGestureOptions>;

  constructor(options: CircleGestureOptions = {}) {
    this.o = {
      sweepThreshold: options.sweepThreshold ?? 5.35,
      trailLength: options.trailLength ?? 240,
      minSegment: options.minSegment ?? 0.006,
      maxTurn: options.maxTurn ?? Math.PI / 3,
      staleMs: options.staleMs ?? 400,
      smoothing: options.smoothing ?? 0.45,
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

    // Smooth before measuring anything. See THE NOISE TRAP.
    if (!this.smooth) {
      this.smooth = { x, y };
    } else {
      const a = this.o.smoothing;
      this.smooth = {
        x: this.smooth.x + (x - this.smooth.x) * a,
        y: this.smooth.y + (y - this.smooth.y) * a,
      };
    }
    x = this.smooth.x;
    y = this.smooth.y;

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
        // A corner this sharp is a zigzag, a wave turning around, or a
        // tracking glitch. Not an arc. This one guard is what rejects a
        // back-and-forth wave, because the turn at each end of a wave is
        // close to PI and nothing else in a real circle comes near maxTurn.
        this.sweep = 0;
      } else {
        // Plain accumulation. An earlier version restarted the sweep whenever
        // the turn changed sign, and that is what made the detector unusable
        // with a real hand: turn per frame on a hand-drawn circle is about
        // 0.1 radians, landmark jitter flips its sign constantly, and every
        // flip threw the accumulation away. It passed every synthetic test
        // and fired 0 times out of 20 on a circle with realistic jitter.
        // Noise does not need rejecting here, it random walks about zero.
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
    const { center, radius } = this.fit();
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
    this.smooth = null;
    this.sweep = 0;
    this.lastT = 0;
  }

  /**
   * Algebraic least-squares circle fit (Kasa). Returns the centre of the
   * circle the path lies on, which is NOT the centroid of the path.
   *
   * WHY NOT THE CENTROID. The centroid of an arc sits inside the arc, pulled
   * toward wherever the samples are densest, and only coincides with the
   * centre when the loop is complete and evenly sampled. A hand always stops
   * a little short and always slows on one side, so the portal landed
   * consistently off from the circle the person actually drew.
   *
   * Fits x^2 + y^2 = a*x + b*y + c, which is linear in (a, b, c), so it is a
   * 3x3 solve with no iteration. Centre is (a/2, b/2). Coordinates are
   * shifted to the centroid first, because the raw normalized values are all
   * near 0.5 and squaring them costs precision in the normal equations.
   *
   * Falls back to the centroid when the points are nearly collinear, where
   * the fit is singular and would throw the portal off screen.
   */
  private fit(): { center: { x: number; y: number }; radius: number } {
    const m = this.centroid();
    const n = this.trail.length;
    let Sxx = 0, Sxy = 0, Syy = 0, Sxz = 0, Syz = 0, Sz = 0, Sx = 0, Sy = 0;
    for (const q of this.trail) {
      const x = q.x - m.x;
      const y = q.y - m.y;
      const z = x * x + y * y;
      Sxx += x * x;
      Sxy += x * y;
      Syy += y * y;
      Sxz += x * z;
      Syz += y * z;
      Sz += z;
      Sx += x;
      Sy += y;
    }
    // Shifted to the centroid, so Sx and Sy are ~0 and the system reduces to
    // a 2x2 in (a, b).
    const det = Sxx * Syy - Sxy * Sxy;
    const meanR = Math.sqrt(Sz / n);
    if (!isFinite(det) || Math.abs(det) < 1e-12) {
      return { center: m, radius: meanR };
    }
    const a = (Sxz * Syy - Syz * Sxy) / det;
    const b = (Syz * Sxx - Sxz * Sxy) / det;
    const cx = a / 2;
    const cy = b / 2;
    const c = Sz / n - (cx * Sx * 2 + cy * Sy * 2) / n;
    const r2 = cx * cx + cy * cy + c;
    const radius = r2 > 0 ? Math.sqrt(r2) : meanR;
    const center = { x: m.x + cx, y: m.y + cy };
    // A fit can run away on a short or noisy arc. Anything wildly outside
    // what the samples support is worse than the centroid.
    const drift = Math.hypot(cx, cy);
    if (!isFinite(radius) || radius > meanR * 4 || drift > meanR * 4) {
      return { center: m, radius: meanR };
    }
    return { center, radius };
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
