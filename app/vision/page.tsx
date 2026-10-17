import type { Metadata } from "next";
import VisionLoader from "./Loader";

export const metadata: Metadata = {
  title: "Vision | OpenVision",
  description:
    "Eye tracking in the browser with WebGazer: nine-point calibration, a gaze cursor and dwell to click.",
};

export default function VisionPage() {
  return <VisionLoader />;
}
