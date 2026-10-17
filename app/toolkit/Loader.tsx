"use client";

import { DemoRoute } from "@/components/DemoRoute";
import { demoFor } from "@/components/demos";

const load = () => import("@/components/Toolkit");

export default function ToolkitLoader() {
  return <DemoRoute demo={demoFor("/toolkit")} load={load} />;
}
