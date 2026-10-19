import axios, { AxiosError, AxiosHeaders, type AxiosAdapter } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";

const originalAdapter = axios.defaults.adapter;
afterEach(() => { axios.defaults.adapter = originalAdapter; vi.unstubAllGlobals(); vi.resetModules(); });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function load(adapter: AxiosAdapter) {
  vi.resetModules();
  // Use the same fresh axios module that the dynamically imported HTTP client uses.
  const freshAxios = (await import("axios")).default;
  freshAxios.defaults.adapter = adapter;
  const client = await import("../src/services/http.js");
  freshAxios.defaults.adapter = originalAdapter;
  return client;
}

const response = (config: any, data: unknown) => ({ status: 200, statusText: "OK", data, headers: new AxiosHeaders(), config });

describe("media HTTP lifecycle guards", () => {
  it("connects the default media transport to CSRF, raw bytes and JSON publication", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const asset = "22222222-2222-4222-8222-222222222222";
    const adapter = vi.fn(async config => response(config, { success: true, data:
      config.url === "/auth/csrf" ? { token: "fixture-token" } : config.url === "/media/publications"
        ? { kind: "PRIVATE", targetId: 42 }
        : { status: "ready", asset: { id: asset, expiresAt: Date.now() + 60000, width: 10, height: 10, mime: "image/png", bytes: 4,
          clearUrl: `/api/media/assets/${asset}/clear`, thumbUrl: `/api/media/assets/${asset}/thumb` } }
    }));
    await load(adapter);
    const { MediaApi } = await import("../src/media/mediaApi");
    const stamp = { accountId: "1", generation: 1 }; const api = new MediaApi(stamp, () => stamp);
    const signal = new AbortController().signal; const file = new File(["test"], "fixture.png", { type: "image/png" });
    const receipt = await api.upload(file, { requestId: id, attachmentId: id, scope: { accountId: "1", target: { kind: "private", recipientId: "2" } }, signal });
    expect(receipt.id).toBe(asset);
    const command = { requestId: id, kind: "PRIVATE" as const, recipient: 2, content: "图片", scene: null, assets: [asset] };
    expect(await api.publish(command, signal)).toEqual({ kind: "PRIVATE", targetId: "42" });
    expect(adapter).toHaveBeenCalledTimes(3);
    const upload = adapter.mock.calls[1][0], publication = adapter.mock.calls[2][0];
    expect(upload.data).toBe(file); expect(upload.headers.get("Content-Type")).toBe("image/png");
    expect(upload.headers.get("X-CSRF-Token")).toBe("fixture-token");
    expect(JSON.parse(publication.data)).toEqual(command);
    expect(publication.headers.get("Content-Type")).toBe("application/json");
  });
  it("does not write if the account generation changes while obtaining CSRF", async () => {
    const token = deferred<any>(); let current = true;
    const adapter = vi.fn(async config => config.url === "/auth/csrf" ? token.promise : response(config, { success: true }));
    const { http } = await load(adapter);
    const config = { mediaGuard: () => { if (!current) throw new DOMException("STALE_ACCOUNT", "AbortError"); } };
    const pending = http.post("/media/publications", "{}", config);
    const assertion = expect(pending).rejects.toThrow("STALE_ACCOUNT");
    await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce());
    current = false;
    token.resolve(response(adapter.mock.calls[0][0], { success: true, data: { token: "old-token" } }));
    await assertion;
    expect(adapter.mock.calls.map(([config]) => config.url)).toEqual(["/auth/csrf"]);
  });

  it.each(["success", "auth-failure"])("ignores stale CSRF %s without clearing the new pending request", async outcome => {
    const oldToken = deferred<any>(); const newToken = deferred<any>();
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    let csrfCalls = 0;
    const adapter = vi.fn(async config => config.url === "/auth/csrf"
      ? (++csrfCalls === 1 ? oldToken.promise : newToken.promise)
      : response(config, { success: true }));
    const { http, invalidateCsrfToken } = await load(adapter);
    const oldWrite = http.post("/media/publications", "{}");
    const oldAssertion = expect(oldWrite).rejects.toMatchObject({ code: "AUTH_CSRF_STALE" });
    await vi.waitFor(() => expect(csrfCalls).toBe(1));
    invalidateCsrfToken();
    const newWrite = http.post("/media/publications", "{}");
    await vi.waitFor(() => expect(csrfCalls).toBe(2));
    oldToken.resolve(response(adapter.mock.calls[0][0], outcome === "success"
      ? { success: true, data: { token: "old-token" } }
      : { success: false, code: "AUTH_SESSION_EXPIRED" }));
    await oldAssertion;
    const anotherWrite = http.post("/media/publications", "{}");
    // Drain interceptor microtasks while the second CSRF response is still pending.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(csrfCalls).toBe(2); expect(dispatchEvent).not.toHaveBeenCalled();
    newToken.resolve(response(adapter.mock.calls[1][0], { success: true, data: { token: "new-token" } }));
    await Promise.all([newWrite, anotherWrite]);
    const writes = adapter.mock.calls.filter(([config]) => config.url !== "/auth/csrf");
    expect(writes).toHaveLength(2);
    for (const [config] of writes) expect(config.headers.get("X-CSRF-Token")).toBe("new-token");
  });

  it.each(["envelope", "http-error"])("checks stale %s responses before auth side effects", async outcome => {
    const gate = deferred<void>(); let current = true;
    const dispatchEvent = vi.fn(); vi.stubGlobal("window", { dispatchEvent });
    const adapter: AxiosAdapter = async config => {
      await gate.promise;
      const result = response(config, { success: false, code: "AUTH_SESSION_EXPIRED" });
      if (outcome === "http-error") throw new AxiosError("expired", "ERR_BAD_RESPONSE", config, undefined, { ...result, status: 401 });
      return result;
    };
    const { http } = await load(adapter);
    const guard = vi.fn(() => { if (!current) throw new Error("STALE_ACCOUNT"); });
    const pending = http.get("/media/uploads/11111111-1111-4111-8111-111111111111", { mediaGuard: guard });
    const assertion = expect(pending).rejects.toThrow("STALE_ACCOUNT");
    await vi.waitFor(() => expect(guard).toHaveBeenCalledOnce());
    current = false; gate.resolve(); await assertion;
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
