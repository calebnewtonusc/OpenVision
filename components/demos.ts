import { Eye, Hand, LayoutGrid, Orbit } from "lucide-react";
import type { DemoInfo } from "./CameraGate";

export interface DemoEntry extends DemoInfo {
  href: string;
  /** What this demo shows that no other one does. Used on the landing. */
  proves: string;
  /** The input it reads. */
  input: string;
}

export const DEMOS: DemoEntry[] = [
  {
    href: "/strange",
    name: "Portal",
    icon: Orbit,
    input: "One hand",
    proves: "A gesture that only exists over time: a circle drawn in the air.",
    pitch:
      "Pinch, sweep a circle in the air, and a sling-ring portal burns open.",
    steps: [
      "Pinch your thumb and index finger together.",
      "Keep pinching and sweep about three quarters of a circle.",
      "Pinch again to close the portal.",
    ],
  },
  {
    href: "/hands",
    name: "Hands",
    icon: Hand,
    input: "Two hands",
    proves: "21 landmarks per hand, live, driving six canvas modes.",
    pitch:
      "Glass hands, pinch to scroll, particles, finger painting, bubbles and a portal.",
    steps: [
      "Hold one or both hands up, palm to the camera.",
      "Pick a mode from the bar at the top.",
      "Pinch and move to scroll; open your palm to clear a drawing.",
    ],
  },
  {
    href: "/toolkit",
    name: "Toolkit",
    icon: LayoutGrid,
    input: "Hands and eyes",
    proves: "Every library primitive on one page, each next to its code.",
    pitch:
      "Gaze plus pinch, two-hand zoom, dwell to click, an air keyboard and a tunable pinch.",
    steps: [
      "Turn on the camera. Hand tools start first.",
      "Press Calibrate gaze, then click each dot while looking at it.",
      "Try each panel; the snippet beside it is the code that runs it.",
    ],
  },
  {
    href: "/vision",
    name: "Vision",
    icon: Eye,
    input: "Eyes, then hands",
    proves: "Look at a panel to focus it, hold your gaze to click.",
    pitch:
      "Eye tracking with WebGazer: calibrate once, then dwell on a target to press it.",
    steps: [
      "Sit at arm's length with your face lit from the front.",
      "Click each of the nine dots five times while looking at it.",
      "Look at a button for 1.2 seconds, or pinch, to press it.",
    ],
  },
];

export function demoFor(href: string): DemoEntry {
  const d = DEMOS.find((x) => x.href === href);
  if (!d) throw new Error(`No demo registered for ${href}`);
  return d;
}
