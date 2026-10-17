"use client";

import { DemoRoute } from "@/components/DemoRoute";
import { demoFor } from "@/components/demos";

const load = () => import("@/components/VisionWeb");

export default function VisionWebLoader() {
  return <DemoRoute demo={demoFor("/vision")} load={load} />;
}
