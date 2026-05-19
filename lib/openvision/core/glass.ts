import type { Landmark } from "./types";

export type RGB = readonly [number, number, number];

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

const FINGER_GROUPS: number[][] = [
  [1, 2, 3, 4], // thumb
  [5, 6, 7, 8], // index
  [9, 10, 11, 12], // middle
  [13, 14, 15, 16], // ring
  [17, 18, 19, 20], // pinky
];

const FINGER_TIP_IDX = [4, 8, 12, 16, 20];

export interface DrawGlassHandOptions {
  /** Map landmark x (0..1) to canvas px. Apply mirror inside if needed. */
  mx: (x: number) => number;
  /** Map landmark y (0..1) to canvas px. */
  my: (y: number) => number;
  /** Accent color (e.g. [167, 139, 250] for left, [52, 211, 153] for right). */
  accent: RGB;
  /** Hue (0..360) for the subtle hsla palm fill. */
  baseHue: number;
  /** Whether this hand is currently pinching. Pulses the halo + arc. */
  pinched: boolean;
  /** Monotonically-increasing phase used to animate the pulse. */
  pulsePhase: number;
}

/**
 * Render one hand as frosted glass on a 2D canvas.
 *
 * Multi-pass: outer halo (screen-blend), fat finger glow, palm blob with
 * radial highlight, inner finger ridge, knuckle bumps, depth-aware fingertip
 * glints, and a pulsing arc between thumb + index when pinching.
 *
 * Pure: no React, no DOM beyond the passed Canvas2D context.
 */
export function drawGlassHand(
  ctx: CanvasRenderingContext2D,
  lm: Landmark[],
  opts: DrawGlassHandOptions,
) {
  const { mx, my, accent, baseHue, pinched, pulsePhase } = opts;

  const avgZ = (lm[0].z + lm[5].z + lm[9].z + lm[13].z + lm[17].z) / 5;
  const closeness = Math.max(0, Math.min(1, 0.5 - avgZ * 6));
  const haloIntensity = 0.35 + closeness * 0.45 + (pinched ? 0.25 : 0);
  const haloSize = 28 + closeness * 18 + (pinched ? 6 : 0);

  const palmIdx = [0, 1, 5, 9, 13, 17];
  let cx = 0;
  let cy = 0;
  for (const i of palmIdx) {
    cx += mx(lm[i].x);
    cy += my(lm[i].y);
  }
  cx /= palmIdx.length;
  cy /= palmIdx.length;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloSize * 6);
  halo.addColorStop(0, rgba(accent, 0.18 * haloIntensity));
  halo.addColorStop(0.4, rgba(accent, 0.08 * haloIntensity));
  halo.addColorStop(1, rgba(accent, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(
    cx - haloSize * 6,
    cy - haloSize * 6,
    haloSize * 12,
    haloSize * 12,
  );
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowBlur = pinched ? 28 : 18;
  ctx.shadowColor = rgba(accent, pinched ? 0.85 : 0.55);
  ctx.strokeStyle = rgba(accent, 0.18);
  ctx.lineWidth = 22;
  for (const grp of FINGER_GROUPS) {
    drawSmoothPath(ctx, [0, ...grp], lm, mx, my);
  }
  ctx.stroke();
  ctx.restore();

  const palmPath = makePalmPath(lm, mx, my);
  ctx.save();
  ctx.fillStyle = `hsla(${baseHue}, 70%, 70%, 0.07)`;
  ctx.shadowBlur = 32;
  ctx.shadowColor = rgba(accent, 0.45 * haloIntensity);
  ctx.fill(palmPath);
  ctx.restore();

  ctx.save();
  ctx.clip(palmPath);
  const palmHi = ctx.createRadialGradient(cx, cy - 30, 2, cx, cy - 10, 140);
  palmHi.addColorStop(0, "rgba(255,255,255,0.32)");
  palmHi.addColorStop(0.4, "rgba(255,255,255,0.12)");
  palmHi.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = palmHi;
  ctx.fillRect(cx - 200, cy - 200, 400, 400);
  ctx.restore();

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 8;
  for (const grp of FINGER_GROUPS) {
    drawSmoothPath(ctx, [0, ...grp], lm, mx, my);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.4;
  for (const grp of FINGER_GROUPS) {
    drawSmoothPath(ctx, [0, ...grp], lm, mx, my);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  for (const i of [5, 9, 13, 17]) {
    const x = mx(lm[i].x);
    const y = my(lm[i].y);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
    g.addColorStop(0, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (const idx of FINGER_TIP_IDX) {
    const p = lm[idx];
    const x = mx(p.x);
    const y = my(p.y);
    const depthBoost = Math.max(0, -p.z * 8);
    const tipR = 6 + depthBoost * 6;
    const pulse =
      pinched && (idx === 4 || idx === 8) ? 1 + Math.sin(pulsePhase) * 0.3 : 1;
    ctx.save();
    ctx.shadowBlur = 18 + depthBoost * 14;
    ctx.shadowColor = rgba(accent, 1);
    const tipGrad = ctx.createRadialGradient(x, y, 0, x, y, tipR * pulse);
    tipGrad.addColorStop(0, "rgba(255,255,255,1)");
    tipGrad.addColorStop(0.4, rgba(accent, 0.9));
    tipGrad.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = tipGrad;
    ctx.beginPath();
    ctx.arc(x, y, tipR * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (pinched) {
    const t = lm[4];
    const i = lm[8];
    const tx = mx(t.x);
    const ty = my(t.y);
    const ix = mx(i.x);
    const iy = my(i.y);
    const px = (tx + ix) / 2;
    const py = (ty + iy) / 2;
    ctx.save();
    ctx.strokeStyle = rgba(accent, 0.85);
    ctx.shadowBlur = 22;
    ctx.shadowColor = rgba(accent, 1);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(ix, iy);
    ctx.stroke();
    ctx.fillStyle = rgba(accent, 0.9);
    ctx.beginPath();
    ctx.arc(px, py, 4 + Math.sin(pulsePhase * 2) * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function makePalmPath(
  lm: Landmark[],
  mx: (x: number) => number,
  my: (y: number) => number,
): Path2D {
  const indices = [0, 1, 5, 9, 13, 17];
  const pts = indices.map((i) => ({ x: mx(lm[i].x), y: my(lm[i].y) }));
  const path = new Path2D();
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const mid = { x: (cur.x + next.x) / 2, y: (cur.y + next.y) / 2 };
    path.quadraticCurveTo(cur.x, cur.y, mid.x, mid.y);
  }
  path.closePath();
  return path;
}

function drawSmoothPath(
  ctx: CanvasRenderingContext2D,
  idxs: number[],
  lm: Landmark[],
  mx: (x: number) => number,
  my: (y: number) => number,
) {
  const pts = idxs.map((i) => ({ x: mx(lm[i].x), y: my(lm[i].y) }));
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mid = {
      x: (pts[i].x + pts[i + 1].x) / 2,
      y: (pts[i].y + pts[i + 1].y) / 2,
    };
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mid.x, mid.y);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
