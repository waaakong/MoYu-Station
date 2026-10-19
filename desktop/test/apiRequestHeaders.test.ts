import { describe, expect, it } from "vitest";
import {
  DESKTOP_CHANNEL_HEADER,
  DESKTOP_CHANNEL_VALUE,
  DESKTOP_ORIGIN,
  desktopApiRequestHeaders
} from "../src/main/security/apiRequestHeaders";

describe("desktop API request headers", () => {
  it("injects the fixed desktop markers only for the fixed StudyRoom API", () => {
    const headers = desktopApiRequestHeaders(
      "https://moyustation.xyz/api/auth/login",
      { Origin: "file://", "X-StudyRoom-Client": "forged", Accept: "application/json" }
    );
    expect(headers.Origin).toBe(DESKTOP_ORIGIN);
    expect(headers[DESKTOP_CHANNEL_HEADER]).toBe(DESKTOP_CHANNEL_VALUE);
    expect(headers.Accept).toBe("application/json");
  });

  it.each([
    "https://evil.example/api/auth/login",
    "https://sub.moyustation.xyz/api/auth/login",
    "http://moyustation.xyz/api/auth/login",
    "ws://moyustation.xyz/ws/chat",
    "https://moyustation.xyz/private-updates/file.exe"
  ])("strips desktop markers from redirects or unrelated destinations: %s", (url) => {
    const headers = desktopApiRequestHeaders(url, {
      Origin: DESKTOP_ORIGIN,
      [DESKTOP_CHANNEL_HEADER]: DESKTOP_CHANNEL_VALUE,
      Authorization: "ordinary-upstream-value"
    });
    expect(headers[DESKTOP_CHANNEL_HEADER]).toBeUndefined();
    expect(headers.Origin).toBeUndefined();
    expect(headers.Authorization).toBe("ordinary-upstream-value");
  });

  it("removes case-insensitive forged copies before injecting one canonical header", () => {
    const headers = desktopApiRequestHeaders("https://moyustation.xyz/api", {
      origin: "https://evil.example",
      "x-studyroom-client": "forged"
    });
    expect(Object.keys(headers).filter((key) => key.toLowerCase() === "origin")).toEqual(["Origin"]);
    expect(Object.keys(headers).filter((key) => key.toLowerCase() === DESKTOP_CHANNEL_HEADER.toLowerCase()))
      .toEqual([DESKTOP_CHANNEL_HEADER]);
  });

  it("normalizes the fixed WebSocket origin without granting the remember-me channel marker", () => {
    const headers = desktopApiRequestHeaders("wss://moyustation.xyz/ws/chat", { Origin: "file://" });
    expect(headers.Origin).toBe(DESKTOP_ORIGIN);
    expect(headers[DESKTOP_CHANNEL_HEADER]).toBeUndefined();
  });

  it("supports a build-selected HTTPS cloud origin without trusting other IPs", () => {
    const headers = desktopApiRequestHeaders(
      "https://8.163.29.26/api/auth/me",
      { Origin: "file://" },
      "https://8.163.29.26"
    );
    expect(headers.Origin).toBe(DESKTOP_ORIGIN);
    expect(headers[DESKTOP_CHANNEL_HEADER]).toBe(DESKTOP_CHANNEL_VALUE);

    const unrelated = desktopApiRequestHeaders(
      "https://8.163.29.27/api/auth/me",
      { Origin: DESKTOP_ORIGIN },
      "https://8.163.29.26"
    );
    expect(unrelated.Origin).toBeUndefined();
    expect(unrelated[DESKTOP_CHANNEL_HEADER]).toBeUndefined();
  });
});
