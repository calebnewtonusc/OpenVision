"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { CameraGate, type DemoInfo } from "./CameraGate";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "./ui";

export type DemoComponent = ComponentType<{ stream?: MediaStream }>;
export type DemoImport = () => Promise<{ default: DemoComponent }>;

/**
 * Camera first, then the demo bundle. The demos touch browser-only APIs at
 * module load (MediaPipe, WebGazer, canvas), so they are imported on the
 * client after the camera is granted, never rendered on the server.
 */
export function DemoRoute({
  demo,
  load,
}: {
  demo: DemoInfo;
  load: DemoImport;
}) {
  return (
    <CameraGate demo={demo}>
      {(stream) => <DemoMount stream={stream} load={load} name={demo.name} />}
    </CameraGate>
  );
}

type MountState =
  | { kind: "loading" }
  | { kind: "ready"; Component: DemoComponent }
  | { kind: "error" };

function DemoMount({
  stream,
  load,
  name,
}: {
  stream: MediaStream;
  load: DemoImport;
  name: string;
}) {
  const [state, setState] = useState<MountState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((mod) => {
        if (!cancelled) setState({ kind: "ready", Component: mod.default });
      })
      .catch((err: unknown) => {
        console.error(`[OpenVision] ${name} failed to load`, err);
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [load, name, attempt]);

  // The demo stops its own tracks, but if it never mounted nobody would.
  useEffect(() => {
    return () => stream.getTracks().forEach((t) => t.stop());
  }, [stream]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  if (state.kind === "ready") return <state.Component stream={stream} />;

  return (
    <main className="ov-backdrop flex min-h-dvh items-center justify-center px-4">
      {state.kind === "loading" ? (
        <div
          role="status"
          className="flex flex-col items-center gap-4 text-center"
        >
          <LoaderCircle
            className="h-8 w-8 animate-spin text-amber-200"
            aria-hidden
          />
          <p className="text-sm text-zinc-300">Loading {name}</p>
        </div>
      ) : (
        <section className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6 sm:p-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
            <TriangleAlert className="h-5 w-5" aria-hidden />
            Load failed
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {name} did not load
          </h1>
          <p className="mt-2 text-base leading-relaxed text-zinc-300">
            The page script failed to download. Check your connection and try
            again.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={retry} className={BUTTON_PRIMARY}>
              <RotateCw className="h-4 w-4" aria-hidden />
              Try again
            </button>
            <Link href="/" className={BUTTON_SECONDARY}>
              Back to demos
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}
