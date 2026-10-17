import type { Metadata } from "next";
import HandsLoader from "./Loader";

export const metadata: Metadata = {
  title: "Hands | OpenVision",
  description:
    "MediaPipe tracks 21 landmarks per hand from a webcam. Glass hands, pinch to scroll, particles, finger painting, bubbles and a portal.",
};

export default function HandsPage() {
  return <HandsLoader />;
}
