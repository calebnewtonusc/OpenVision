import type { Metadata } from "next";
import VisionLoader from "./Loader";

export const metadata: Metadata = {
  title: "VisionWeb: Eye Tracking in Your Browser",
  description:
    "WebGazer.js eye tracking calibrated to your gaze. Control spatial UI entirely with your eyes. No headset required.",
};

export default function VisionPage() {
  return <VisionLoader />;
}
