import type { Metadata } from "next";
import HandsLoader from "./Loader";

export const metadata: Metadata = {
  title: "HandsWeb — Hand Tracking in Your Browser",
  description:
    "MediaPipe tracks 21 landmarks per hand. Pinch, point, grab, and gesture to interact with particles, fluid, and 3D objects.",
};

export default function HandsPage() {
  return <HandsLoader />;
}
