import { describe, expect, it } from "vitest";
import {
  STUDYROOM_DESKTOP_ORIGIN,
  normalizeCloudOrigin,
  studyRoomWebSocketOrigin
} from "../src/main/security/cloudOrigin";

describe("desktop cloud build origin", () => {
  it("accepts one exact HTTPS origin and derives its secure WebSocket origin", () => {
    const origin = normalizeCloudOrigin("https://8.163.29.26");
    expect(origin).toBe("https://8.163.29.26");
    expect(studyRoomWebSocketOrigin(origin)).toBe("wss://8.163.29.26");
    expect(STUDYROOM_DESKTOP_ORIGIN).toBe("https://desktop.moyustation.xyz");
  });

  it.each([
    "http://8.163.29.26",
    "https://8.163.29.26/api",
    "https://user" + ":secret@8.163.29.26",
    "file:///C:/StudyRoom"
  ])("rejects an unsafe origin: %s", (origin) => {
    expect(() => normalizeCloudOrigin(origin)).toThrow("STUDYROOM_CLOUD_ORIGIN_INVALID");
  });
});
