/**
 * Opening the webcam, with every failure sorted into something a person can
 * act on. getUserMedia rejects with a DOMException whose `name` is the only
 * reliable signal; the message text differs per browser.
 */

export type CameraIssue =
  /** The user, or a browser setting, blocked camera access. */
  | "denied"
  /** No video input device exists. */
  | "no-camera"
  /** A device exists but another app or tab holds it. */
  | "in-use"
  /** Page is not HTTPS or localhost, so the API is withheld. */
  | "insecure"
  /** The browser has no getUserMedia at all. */
  | "unsupported"
  | "unknown";

export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; issue: CameraIssue; detail: string };

/** Sort a getUserMedia rejection by its DOMException name. */
export function classifyCameraError(err: unknown): CameraIssue {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

export interface CameraEnv {
  isSecureContext: boolean;
  hasGetUserMedia: boolean;
}

/** Decide before prompting whether a prompt can even happen. */
export function cameraPreflight(env: CameraEnv): CameraIssue | null {
  if (!env.isSecureContext) return "insecure";
  if (!env.hasGetUserMedia) return "unsupported";
  return null;
}

export const DEFAULT_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

/**
 * Ask for the front camera. Never throws: failures come back as a typed
 * issue so the caller can render the right state instead of a raw string.
 */
export async function requestCamera(
  video: MediaTrackConstraints = DEFAULT_VIDEO_CONSTRAINTS,
): Promise<CameraResult> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { ok: false, issue: "unsupported", detail: "No browser window" };
  }
  const pre = cameraPreflight({
    isSecureContext: window.isSecureContext,
    hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
  });
  if (pre) return { ok: false, issue: pre, detail: pre };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video,
      audio: false,
    });
    return { ok: true, stream };
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return {
      ok: false,
      issue: classifyCameraError(err),
      detail: `${e.name ?? "Error"}: ${e.message ?? String(err)}`,
    };
  }
}
