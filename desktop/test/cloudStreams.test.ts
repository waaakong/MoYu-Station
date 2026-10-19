import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ net: {}, ipcMain: {} }));
import { SseFrames } from "../src/main/cloud/streams";
import { trustedCloudDocument } from "../src/main/cloud/register";

describe("cloud stream and sender boundaries", () => {
  it("parses partial CRLF and multi-line dashboard events without forwarding comments", () => {
    const frames = new SseFrames();
    expect(frames.push(":keepalive\r\n\r\nevent: dash")).toEqual([]);
    expect(frames.push("board\r\ndata: one\r\ndata: two\r")).toEqual([]);
    expect(frames.push("\n\r\n")).toEqual([{ event: "dashboard", data: "one\ntwo" }]);
    expect(() => frames.push("x".repeat(300000))).toThrow();
  });
  it("pins IPC to the packaged document, not another file or a remote page", () => {
    const entry = "file:///E:/app/index.html";
    expect(trustedCloudDocument(entry + "#/chat", entry)).toBe(true);
    expect(trustedCloudDocument("file:///E:/app/other.html", entry)).toBe(false);
    expect(trustedCloudDocument("https://cloud.invalid/", entry)).toBe(false);
  });
});
