/**
 * The one place a sensor coordinate becomes a screen coordinate.
 *
 * MediaPipe landmarks and PinchResult centers arrive normalized to the camera
 * image: x and y in 0..1, x running left to right as the CAMERA sees it. A
 * selfie view flips x so the user sees themselves the right way round. Every
 * surface in this repo used to write that flip itself, `(1 - x) * W`, in six
 * different files. When one of them changed (a hand-size knob, a calibration
 * offset) the others did not, and the cursor, the drawing and the hit test
 * drifted apart.
 *
 * So: build one ScreenMap per surface per frame, at the boundary, and pass
 * its output downstream. Anything that needs a new adjustment (zoom, offset,
 * per-user calibration) adds it here and nowhere else.
 *
 * The unit conversion stays decision free: the only branch is `mirror`, which
 * is fixed when the map is created, not per point.
 */

export interface ScreenMapOptions {
  /** Target width in px (canvas CSS width, or window.innerWidth). Use 1 to stay normalized. */
  width: number;
  /** Target height in px. Use 1 to stay normalized. */
  height: number;
  /** Flip x so the view reads like a mirror. Default true, the selfie view. */
  mirror?: boolean;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenMap {
  readonly width: number;
  readonly height: number;
  readonly mirror: boolean;
  /** Normalized camera x (0..1) to screen x. */
  x: (nx: number) => number;
  /** Normalized camera y (0..1) to screen y. */
  y: (ny: number) => number;
  /** Both at once. Extra fields such as z are dropped. */
  point: (p: { x: number; y: number }) => ScreenPoint;
}

export function createScreenMap(opts: ScreenMapOptions): ScreenMap {
  const { width, height } = opts;
  const mirror = opts.mirror ?? true;
  const x = mirror
    ? (nx: number) => (1 - nx) * width
    : (nx: number) => nx * width;
  const y = (ny: number) => ny * height;
  return {
    width,
    height,
    mirror,
    x,
    y,
    point: (p) => ({ x: x(p.x), y: y(p.y) }),
  };
}

/**
 * The same flip in normalized space, for surfaces that lay things out in
 * 0..1 coordinates (the photo wall) rather than pixels.
 */
export const NORMALIZED_MIRROR: ScreenMap = createScreenMap({
  width: 1,
  height: 1,
  mirror: true,
});
