import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { DEMOS } from "@/components/demos";
import { PinchFigure } from "@/components/PinchFigure";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, LINK_GHOST } from "@/components/ui";

const REPO = "https://github.com/calebnewtonusc/OpenVision";

const MODULES: { name: string; does: string }[] = [
  {
    name: "createScreenMap",
    does: "Camera coordinates to screen pixels, mirror included. Call it once.",
  },
  {
    name: "PinchDetector",
    does: "Thumb to index pinch with hysteresis, hold and drag states.",
  },
  {
    name: "classifyGesture",
    does: "Fist, open, point, peace, thumbs up, pinky, pinch from one frame.",
  },
  {
    name: "CircleGestureDetector",
    does: "A circle drawn over time, by total turning angle.",
  },
  {
    name: "useHandTracking",
    does: "MediaPipe Hands as a React hook, with pinch and gesture per hand.",
  },
  {
    name: "useGazeTracking",
    does: "WebGazer as a React hook. GazeCalibration and useDwellClick sit beside it.",
  },
];

const SNIPPET = `import { PinchDetector, createScreenMap } from "@/lib/openvision";

const pinch = new PinchDetector();          // enter 0.38, exit 0.52
const screen = createScreenMap({ width: innerWidth, height: innerHeight });

// landmarks: 21 points from MediaPipe, normalized 0..1
const r = pinch.update(landmarks);
if (r.state === "released" && r.center) {
  const { x, y } = screen.point(r.center);  // the one mapping
  document.elementFromPoint(x, y)?.dispatchEvent(new MouseEvent("click"));
}`;

export default function Home() {
  return (
    <div className="ov-backdrop min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-2.5 rounded-lg font-semibold tracking-tight text-white transition-colors duration-200 hover:text-amber-100"
        >
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border-2 border-amber-300"
          />
          OpenVision
        </Link>
        <nav className="flex items-center gap-1">
          <a href="#demos" className={`${LINK_GHOST} hidden sm:inline-flex`}>
            Demos
          </a>
          <a href="#toolkit" className={`${LINK_GHOST} hidden sm:inline-flex`}>
            Toolkit
          </a>
          <a href={REPO} className={LINK_GHOST}>
            GitHub
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pb-28 md:pt-16">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
              Spatial input from a&nbsp;webcam.
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-zinc-300">
              Hand tracking, pinch, gaze and dwell to click, in a browser tab.
              The video never leaves it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/strange" className={BUTTON_PRIMARY}>
                Open the portal
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <a href="#demos" className={BUTTON_SECONDARY}>
                See all four demos
              </a>
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              Needs a webcam. Built for a laptop at arm&apos;s length.
            </p>
          </div>
          <PinchFigure />
        </section>

        <section
          id="demos"
          className="scroll-mt-6 border-t border-white/5 bg-zinc-950/60 py-20 md:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Four demos
            </h2>
            <p className="mt-3 max-w-xl text-base text-zinc-400">
              Each asks for the camera once, then runs on your device.
            </p>
            <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {DEMOS.map((d) => (
                <li key={d.href}>
                  <Link
                    href={d.href}
                    className="group flex h-full flex-col rounded-2xl border border-white/10 bg-zinc-900/60 p-6 transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-amber-200/30 hover:bg-zinc-900 active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="rounded-lg border border-white/10 bg-white/5 p-2.5 text-zinc-200 transition-colors duration-200 group-hover:text-amber-200">
                        <d.icon className="h-6 w-6" aria-hidden />
                      </div>
                      <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400">
                        {d.input}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-semibold tracking-tight text-white">
                      {d.name}
                    </h3>
                    <p className="mt-2 flex-1 text-base leading-relaxed text-zinc-400">
                      {d.proves}
                    </p>
                    <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-amber-200">
                      Open {d.name}
                      <ArrowRight
                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                        aria-hidden
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="toolkit" className="scroll-mt-6 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
                The toolkit underneath
              </h2>
              <p className="mt-3 max-w-md text-base text-zinc-400">
                A core of plain, tested TypeScript with no dependencies, and
                React hooks that wrap it.
              </p>
              <ul className="mt-8 divide-y divide-white/5 border-y border-white/5">
                {MODULES.map((m) => (
                  <li key={m.name} className="py-3">
                    <code className="font-mono text-sm text-zinc-100">
                      {m.name}
                    </code>
                    <p className="mt-1 text-sm text-zinc-400">{m.does}</p>
                  </li>
                ))}
              </ul>
              <a
                href={`${REPO}/tree/main/lib/openvision#readme`}
                className={`${BUTTON_SECONDARY} mt-8`}
              >
                Read the toolkit docs
                <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <pre className="min-w-0 overflow-x-auto rounded-2xl border border-white/10 bg-black/50 p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
              <code>{SNIPPET}</code>
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>MediaPipe Hands and WebGazer.js, running on your device.</p>
          <a
            href={REPO}
            className="w-fit rounded text-zinc-400 transition-colors duration-200 hover:text-white"
          >
            Source on GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
