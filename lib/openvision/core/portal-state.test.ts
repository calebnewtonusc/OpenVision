import { describe, it, expect } from "vitest";
import { initialPortalState, stepPortal, type PortalState } from "./portal-state";

const CENTER = { x: 400, y: 300 };

function frame(s: PortalState, now: number, o: Partial<{ pinched: boolean; completed: boolean; progress: number }> = {}) {
  return stepPortal(s, {
    now,
    pinched: o.pinched ?? false,
    completed: o.completed ?? false,
    progress: o.progress ?? 0,
    center: o.completed ? CENTER : null,
    radius: 120,
  });
}

/** Draw a circle with the pinch held, completing at `at`. Pinch stays held. */
function drawCircle(s: PortalState, at: number) {
  for (let t = at - 300; t < at; t += 33) s = frame(s, t, { pinched: true, progress: 0.5 });
  return frame(s, at, { pinched: true, completed: true });
}

describe("portal state machine", () => {
  it("opens on a completed circle", () => {
    const s = drawCircle(initialPortalState(), 1000);
    expect(s.phase).toBe("igniting");
    expect(s.x).toBe(CENTER.x);
  });

  // Bug 1, 2026-09-21. The pinch that DREW the circle is still held when the
  // circle completes, so the frame after opening saw "open, and a pinch" and
  // closed it. The portal existed for one frame.
  it("does not close itself while the drawing pinch is still held", () => {
    let s = drawCircle(initialPortalState(), 1000);
    for (let t = 1000; t < 4000; t += 33) {
      s = frame(s, t, { pinched: true });
      expect(s.phase, `t=${t}`).not.toBe("closing");
    }
    expect(s.phase).toBe("open");
  });

  it("closes on a fresh pinch after the drawing pinch is released", () => {
    let s = drawCircle(initialPortalState(), 1000);
    for (let t = 1000; t < 2000; t += 33) s = frame(s, t, { pinched: true });
    for (let t = 2000; t < 2200; t += 33) s = frame(s, t, { pinched: false });
    expect(s.phase).toBe("open");
    s = frame(s, 2300, { pinched: true });
    expect(s.phase).toBe("closing");
  });

  // Bug 2, 2026-09-21: "I can't open it again once it is closed."
  it("can be opened, closed, and opened again", () => {
    let s = drawCircle(initialPortalState(), 1000);
    for (let t = 1000; t < 2000; t += 33) s = frame(s, t, { pinched: true });
    for (let t = 2000; t < 2200; t += 33) s = frame(s, t, { pinched: false });

    s = frame(s, 2300, { pinched: true });
    expect(s.phase).toBe("closing");

    // He keeps holding the pinch through the whole collapse, which is what a
    // person actually does.
    for (let t = 2300; t < 2800; t += 33) s = frame(s, t, { pinched: true });
    expect(s.phase).toBe("idle");

    for (let t = 2800; t < 3000; t += 33) s = frame(s, t, { pinched: false });
    const again = drawCircle(s, 3500);
    expect(again.phase).toBe("igniting");
  });

  it("survives ten open and close cycles", () => {
    let s = initialPortalState();
    let t = 1000;
    for (let cycle = 0; cycle < 10; cycle++) {
      s = drawCircle(s, t);
      expect(s.phase, `open cycle ${cycle}`).toBe("igniting");
      for (let k = 0; k < 40; k++) s = frame(s, (t += 33), { pinched: true });
      for (let k = 0; k < 8; k++) s = frame(s, (t += 33), { pinched: false });
      s = frame(s, (t += 33), { pinched: true });
      expect(s.phase, `close cycle ${cycle}`).toBe("closing");
      for (let k = 0; k < 20; k++) s = frame(s, (t += 33), { pinched: true });
      expect(s.phase, `idle cycle ${cycle}`).toBe("idle");
      for (let k = 0; k < 8; k++) s = frame(s, (t += 33), { pinched: false });
      t += 400;
    }
  });

  it("ignores a pinch flicker in the first moments of a portal", () => {
    let s = drawCircle(initialPortalState(), 1000);
    s = frame(s, 1050, { pinched: false });
    s = frame(s, 1080, { pinched: true });
    expect(s.phase).not.toBe("closing");
  });

  it("labels drawing only while no portal is up", () => {
    let s = frame(initialPortalState(), 100, { pinched: true, progress: 0.4 });
    expect(s.phase).toBe("drawing");
    s = drawCircle(s, 1000);
    for (let t = 1000; t < 1600; t += 33) s = frame(s, t, { pinched: true, progress: 0.9 });
    expect(s.phase).toBe("open");
  });
});
