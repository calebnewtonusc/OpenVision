"use client";

import { DemoRoute } from "@/components/DemoRoute";
import { demoFor } from "@/components/demos";

const load = () => import("@/components/HandsWeb");

export default function HandsWebLoader() {
  return <DemoRoute demo={demoFor("/hands")} load={load} />;
}
