import type { Metadata } from "next";
import StrangeLoader from "./Loader";

export const metadata: Metadata = {
  title: "Portal | OpenVision",
  description:
    "Pinch and draw a circle in the air to open a Doctor Strange portal. Hand tracking in the browser, from a webcam.",
};

export default function StrangePage() {
  return <StrangeLoader />;
}
