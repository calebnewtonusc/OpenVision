import { describe, it, expect } from "vitest";
import { classifyCameraError, cameraPreflight } from "./camera";

const named = (name: string) => ({ name, message: "x" });

describe("classifyCameraError", () => {
  it("maps a blocked prompt to denied", () => {
    expect(classifyCameraError(named("NotAllowedError"))).toBe("denied");
    expect(classifyCameraError(named("PermissionDeniedError"))).toBe("denied");
    expect(classifyCameraError(named("SecurityError"))).toBe("denied");
  });

  it("maps a missing device to no-camera", () => {
    expect(classifyCameraError(named("NotFoundError"))).toBe("no-camera");
    expect(classifyCameraError(named("OverconstrainedError"))).toBe(
      "no-camera",
    );
  });

  it("maps a busy device to in-use", () => {
    expect(classifyCameraError(named("NotReadableError"))).toBe("in-use");
  });

  it("falls back to unknown for anything else, including non-errors", () => {
    expect(classifyCameraError(named("WeirdError"))).toBe("unknown");
    expect(classifyCameraError("nope")).toBe("unknown");
    expect(classifyCameraError(null)).toBe("unknown");
  });
});

describe("cameraPreflight", () => {
  it("blocks plain HTTP before the API is even checked", () => {
    expect(
      cameraPreflight({ isSecureContext: false, hasGetUserMedia: true }),
    ).toBe("insecure");
  });
  it("reports a browser without getUserMedia", () => {
    expect(
      cameraPreflight({ isSecureContext: true, hasGetUserMedia: false }),
    ).toBe("unsupported");
  });
  it("passes a secure page with the API", () => {
    expect(
      cameraPreflight({ isSecureContext: true, hasGetUserMedia: true }),
    ).toBeNull();
  });
});
