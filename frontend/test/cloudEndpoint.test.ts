import { describe, expect, it } from "vitest";
import {
  desktopApiBaseUrl,
  desktopWebSocketUrl,
  normalizeDesktopCloudOrigin
} from "../src/config/cloudEndpoint";

describe("desktop cloud endpoint", () => {
  it("derives API and WebSocket endpoints from one HTTPS origin", () => {
    const origin = normalizeDesktopCloudOrigin("https://8.163.29.26");
    expect(desktopApiBaseUrl(origin)).toBe("https://8.163.29.26/api");
    expect(desktopWebSocketUrl("/ws/chat", origin)).toBe("wss://8.163.29.26/ws/chat");
  });

  it.each([
    "http://8.163.29.26",
    "https://user" + ":secret@8.163.29.26",
    "https://8.163.29.26/api",
    "https://8.163.29.26?target=other"
  ])("rejects an unsafe desktop cloud origin: %s", (origin) => {
    expect(() => normalizeDesktopCloudOrigin(origin)).toThrow("DESKTOP_CLOUD_ORIGIN_INVALID");
  });
});
