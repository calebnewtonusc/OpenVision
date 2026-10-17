"use client";

import { DemoRoute } from "@/components/DemoRoute";
import { demoFor } from "@/components/demos";

const load = () => import("./StrangePortal");

export default function StrangePortalLoader() {
  return <DemoRoute demo={demoFor("/strange")} load={load} />;
}
