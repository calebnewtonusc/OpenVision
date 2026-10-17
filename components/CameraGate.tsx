"use client";

import Link from "next/link";
import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Laptop,
  Lock,
  LoaderCircle,
  RotateCw,
  ShieldCheck,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import { requestCamera, type CameraIssue } from "@/lib/openvision/core/camera";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, LINK_GHOST } from "./ui";

export interface DemoInfo {
  /** Short name, e.g. "Portal". */
  name: string;
  /** One sentence: what you do with your hands or eyes here. */
  pitch: string;
  /** Up to three steps, shown before the camera turns on. */
  steps: string[];
  icon: LucideIcon;
}

type Phase =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "granted"; stream: MediaStream }
  | { kind: "failed"; issue: CameraIssue; detail: string };

const ISSUE_COPY: Record<
  CameraIssue,
  { title: string; body: string; icon: LucideIcon; retry: boolean }
> = {
  denied: {
    title: "Camera is blocked",
    body: "Click the camera icon in the address bar, set it to Allow, then try again.",
    icon: CameraOff,
    retry: true,
  },
  "no-camera": {
    title: "No camera found",
    body: "This demo needs a webcam. Plug one in, or open this page on a laptop.",
    icon: Unplug,
    retry: true,
  },
  "in-use": {
    title: "Camera is busy",
    body: "Another app or tab is using it. Close that one, then try again.",
    icon: CameraOff,
    retry: true,
  },
  insecure: {
    title: "This page needs HTTPS",
    body: "Browsers only open the camera on HTTPS or localhost.",
    icon: Lock,
    retry: false,
  },
  unsupported: {
    title: "This browser cannot open a camera",
    body: "Try a recent Chrome, Edge, Safari or Firefox.",
    icon: CameraOff,
    retry: false,
  },
  unknown: {
    title: "The camera did not start",
    body: "Something went wrong opening it. Try again, or reload the page.",
    icon: CameraOff,
    retry: true,
  },
};

// The pinch and gesture thresholds were tuned on a laptop webcam at arm's
// length. A phone still runs, but the hand fills the frame and the demo
// layouts are tight, so say so before asking for the camera.
const SMALL_SCREEN = "(max-width: 767px), (pointer: coarse)";

function subscribeSmall(cb: () => void) {
  const mq = window.matchMedia(SMALL_SCREEN);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useIsSmallScreen() {
  return useSyncExternalStore(
    subscribeSmall,
    () => window.matchMedia(SMALL_SCREEN).matches,
    () => false,
  );
}

/**
 * The front door of every camera demo. Explains the demo, asks for the
 * camera once, and turns every failure into a state a person can act on.
 * Children render only after a stream is granted.
 */
export function CameraGate({
  demo,
  children,
}: {
  demo: DemoInfo;
  children: (stream: MediaStream) => ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const small = useIsSmallScreen();

  const ask = useCallback(async () => {
    setPhase({ kind: "requesting" });
    const r = await requestCamera();
    setPhase(
      r.ok
        ? { kind: "granted", stream: r.stream }
        : { kind: "failed", issue: r.issue, detail: r.detail },
    );
  }, []);

  if (phase.kind === "granted") return <>{children(phase.stream)}</>;

  const Icon = demo.icon;
  const failure = phase.kind === "failed" ? ISSUE_COPY[phase.issue] : null;

  return (
    <main className="ov-backdrop relative flex min-h-dvh flex-col px-4 py-4 sm:px-6">
      <Link href="/" className={`${LINK_GHOST} w-fit`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All demos
      </Link>

      <div className="flex flex-1 items-center justify-center py-10">
        <section
          aria-live="polite"
          className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900/80 p-6 backdrop-blur-xl sm:p-8"
        >
          {failure && phase.kind === "failed" ? (
            <>
              <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm font-medium text-red-200">
                <failure.icon className="h-5 w-5" aria-hidden />
                Camera off
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                {failure.title}
              </h1>
              <p className="mt-2 text-base leading-relaxed text-zinc-300">
                {failure.body}
              </p>
              {phase.issue === "unknown" && (
                <p className="mt-3 break-words rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-zinc-400">
                  {phase.detail}
                </p>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {failure.retry && (
                  <button
                    type="button"
                    onClick={ask}
                    className={BUTTON_PRIMARY}
                  >
                    <RotateCw className="h-4 w-4" aria-hidden />
                    Try again
                  </button>
                )}
                <Link href="/" className={BUTTON_SECONDARY}>
                  Back to demos
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="mb-5 inline-flex rounded-lg border border-amber-300/20 bg-amber-300/10 p-2.5 text-amber-200">
                <Icon className="h-6 w-6" aria-hidden />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                {demo.name}
              </h1>
              <p className="mt-2 text-base leading-relaxed text-zinc-300">
                {demo.pitch}
              </p>

              <ol className="mt-6 space-y-3">
                {demo.steps.map((s, i) => (
                  <li key={s} className="flex gap-3 text-sm text-zinc-300">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 font-mono text-xs text-zinc-400">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>

              {small && (
                <p className="mt-6 flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-zinc-300">
                  <Laptop
                    className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                    aria-hidden
                  />
                  Built for a laptop webcam at arm&apos;s length. It runs on a
                  phone, but the screen is tight.
                </p>
              )}

              <button
                type="button"
                onClick={ask}
                disabled={phase.kind === "requesting"}
                className={`${BUTTON_PRIMARY} mt-6 w-full disabled:cursor-wait disabled:opacity-70`}
              >
                {phase.kind === "requesting" ? (
                  <>
                    <LoaderCircle
                      className="h-5 w-5 animate-spin"
                      aria-hidden
                    />
                    Waiting for permission
                  </>
                ) : (
                  <>
                    <Camera className="h-5 w-5" aria-hidden />
                    {small ? "Turn on camera anyway" : "Turn on camera"}
                  </>
                )}
              </button>
              {phase.kind === "requesting" && (
                <p className="mt-3 text-center text-sm text-zinc-400">
                  Your browser is asking. Choose Allow.
                </p>
              )}

              <p className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-500">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Video is processed in this tab and never uploaded.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
