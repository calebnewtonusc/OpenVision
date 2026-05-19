import type { Metadata } from "next";
import ToolkitLoader from "./Loader";

export const metadata: Metadata = {
  title: "OpenVision Toolkit: Live Examples of Every Primitive",
  description:
    "One page, one camera, every tool in the OpenVision library running side by side: hand tracking, gaze tracking, pinch detection, dwell-to-click, pinch-to-scroll, spatial panels.",
};

export default function ToolkitPage() {
  return <ToolkitLoader />;
}
