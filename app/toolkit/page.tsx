import type { Metadata } from "next";
import ToolkitLoader from "./Loader";

export const metadata: Metadata = {
  title: "Toolkit | OpenVision",
  description:
    "Every OpenVision primitive running live on one page: gaze plus pinch, two-hand zoom, dwell to click, an air keyboard and a tunable pinch.",
};

export default function ToolkitPage() {
  return <ToolkitLoader />;
}
