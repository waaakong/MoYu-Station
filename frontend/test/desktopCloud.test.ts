import { afterEach, describe, expect, it, vi } from "vitest";
import { AxiosHeaders } from "axios";
import { desktopCloudAdapter, DesktopCloudStream } from "../src/services/desktopCloud";
import { cloudMediaUrl } from "../src/utils/cloudMedia";

afterEach(() => vi.unstubAllGlobals());

describe("desktop cloud renderer adapter", () => {
  it("only serializes path, method and JSON, not axios credentials or headers", async () => {
    const request = vi.fn(async () => ({ status: 200, data: { success: true }, retryAfter: "" }));
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    await desktopCloudAdapter({ method: "post", url: "/auth/login", data: '{"username":"synthetic"}', headers: new AxiosHeaders({ Cookie: "must-not-cross", Origin: "must-not-cross" }) });
    expect(request).toHaveBeenCalledWith({ method: "POST", path: "/auth/login", json: '{"username":"synthetic"}' });
  });
  it("retains query parameters and reports server errors with status/code", async () => {
    const request = vi.fn(async () => ({ status: 403, data: { code: "ADMIN_REVERIFY_REQUIRED" }, retryAfter: "3" }));
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    await expect(desktopCloudAdapter({ method: "get", url: "/admin/audits", params: { page: 2 }, headers: new AxiosHeaders(), validateStatus: status => status < 400 })).rejects.toMatchObject({ response: { status: 403, data: { code: "ADMIN_REVERIFY_REQUIRED" }, headers: { "retry-after": "3" } } });
    expect(request.mock.calls[0]).toEqual([{ method: "GET", path: "/admin/audits?page=2" }]);
  });
  it("transfers file bytes, not a local filename path or a FormData object", async () => {
    const request = vi.fn(async () => ({ status: 200, data: {}, retryAfter: "" }));
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    const form = new FormData(); form.append("file", new Blob(["test"], { type: "image/png" }), "test.png");
    await desktopCloudAdapter({ method: "post", url: "/profile/avatar", data: form, headers: new AxiosHeaders() });
    expect(request.mock.calls[0]).toEqual([{ method: "POST", path: "/profile/avatar", form: [{ name: "file", file: { name: "test.png", type: "image/png", bytes: new TextEncoder().encode("test") } }] }]);
  });
  it("maps only bounded upload URLs to the desktop media scheme", () => {
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: {} } });
    expect(cloudMediaUrl("/uploads/chat/test.webp")).toBe("studyroom-media://cloud/uploads/chat/test.webp");
    expect(cloudMediaUrl("file:///etc/passwd")).toBe("");
    expect(cloudMediaUrl("https:%%%invalid")).toBe("");
    expect(cloudMediaUrl("https://other.invalid/uploads/a.png")).toBe("");
    expect(cloudMediaUrl("/uploads/a.svg")).toBe("");
    const asset = "/api/media/assets/11111111-1111-4111-8111-111111111111";
    for (const variant of ["clear", "thumb"]) expect(cloudMediaUrl(`${asset}/${variant}`)).toBe(`studyroom-media://cloud${asset}/${variant}`);
    for (const suffix of ["original", "clear?ownerId=2", "../clear"]) expect(cloudMediaUrl(`${asset}/${suffix}`)).toBe("");
    vi.stubGlobal("window", {});
    expect(cloudMediaUrl("/uploads/chat/test.webp")).toBe("/uploads/chat/test.webp");
    expect(cloudMediaUrl(`${asset}/clear`)).toBe(`${asset}/clear`);
  });
  it("transfers a candidate as bounded raw bytes without its local name or headers", async () => {
    const request = vi.fn(async () => ({ status: 200, data: {}, retryAfter: "" }));
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    const path = "/media/assets?clientUploadId=11111111-1111-4111-8111-111111111111";
    await desktopCloudAdapter({ method: "post", url: path,
      data: new File(["candidate"], "private-name.png", { type: "image/png" }),
      headers: new AxiosHeaders({ Cookie: "must-not-cross" }) });
    expect(request).toHaveBeenCalledWith({ method: "POST", path,
      binary: { type: "image/png", bytes: new TextEncoder().encode("candidate") } });
  });
  it.each(["cancel", "account-change"])("does not dispatch after %s while reading file bytes", async action => {
    const request = vi.fn();
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    let release!: (value: ArrayBuffer) => void;
    const data = new Blob(["candidate"], { type: "image/png" });
    const reading = vi.spyOn(data, "arrayBuffer").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const controller = new AbortController(); let current = true;
    const config = { method: "post", url: "/media/assets", data, headers: new AxiosHeaders(), signal: controller.signal,
      mediaGuard: () => { if (!current) throw new Error("STALE_ACCOUNT"); } };
    const pending = desktopCloudAdapter(config);
    const assertion = expect(pending).rejects.toThrow(action === "cancel" ? "canceled" : "STALE_ACCOUNT");
    expect(reading).toHaveBeenCalledOnce();
    if (action === "cancel") controller.abort(); else current = false;
    release(new ArrayBuffer(1)); await assertion;
    expect(request).not.toHaveBeenCalled();
  });
  it("discards late bridge results when the media session changes", async () => {
    let release!: (value: any) => void; let current = true;
    const request = vi.fn(() => new Promise(resolve => { release = resolve; }));
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { request } } });
    const config = { method: "get", url: "/media/publications/11111111-1111-4111-8111-111111111111", headers: new AxiosHeaders(),
      mediaGuard: () => { if (!current) throw new Error("STALE_ACCOUNT"); } };
    const pending = desktopCloudAdapter(config);
    const assertion = expect(pending).rejects.toThrow("STALE_ACCOUNT");
    current = false; release({ status: 200, data: { private: "old-session" }, retryAfter: "" });
    await assertion;
  });
  it("routes events by connection id, cleans up listeners, and closes on IPC send failure", async () => {
    let emit!: (event: any) => void;
    const unsubscribe = vi.fn(); const closeStream = vi.fn(async () => {});
    const openStream = vi.fn(async () => {}); const sendChat = vi.fn(async () => { throw new Error("offline"); });
    vi.stubGlobal("window", { studyRoomDesktop: { cloud: { openStream, closeStream, sendChat, onStreamEvent: (callback: typeof emit) => { emit = callback; return unsubscribe; } } } });
    const stream = new DesktopCloudStream("chat"); const received = vi.fn(); stream.addEventListener("message", received);
    emit({ id: "other", type: "open" }); expect(stream.readyState).toBe(0);
    emit({ id: stream.id, type: "open" }); expect(stream.readyState).toBe(1);
    emit({ id: stream.id, type: "message", data: "hello" }); expect(received).toHaveBeenCalledOnce();
    stream.send('{"type":"PING"}'); await Promise.resolve(); await Promise.resolve();
    expect(stream.readyState).toBe(3); expect(unsubscribe).toHaveBeenCalledOnce(); expect(closeStream).toHaveBeenCalledWith(stream.id);
  });
});
