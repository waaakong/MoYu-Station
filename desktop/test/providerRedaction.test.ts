import { describe, expect, it } from "vitest";
import { redactText, safeProviderLog } from "../src/providers/core/redaction";

describe("provider log redaction", () => {
  it("allows only the reviewed event shape", () => {
    expect(safeProviderLog({ providerId: "qq", operation: "search", durationMs: 12, correlationId: "request-1" }))
      .toEqual({ providerId: "qq", operation: "search", durationMs: 12, correlationId: "request-1", errorCode: undefined });
    expect(() => safeProviderLog({ providerId: "qq", operation: "search", durationMs: 1, correlationId: "1", authorization: "private" }))
      .toThrow("UNSAFE_PROVIDER_LOG_FIELD");
  });

  it("removes remote locations from text", () => {
    expect(redactText("failed at https://music.example.invalid/path?id=1")).toBe("failed at [redacted-url]");
  });
});
