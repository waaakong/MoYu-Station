import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProviderWorkerRuntime } from "../src/providers/core/providerWorkerRuntime";
import { parseWorkerRequest, parseWorkerResponse, type ProviderWorkerRequest, type ProviderWorkerResponse } from "../src/providers/core/providerWorkerProtocol";

function request(): ProviderWorkerRequest { return { requestId: randomUUID(), providerId: "netease", operation: "search", payload: { query: "rain" } }; }

describe("provider utility runtime", () => {
  it("passes a cancel signal to the actual operation and suppresses its late value", async () => {
    const replies: ProviderWorkerResponse[] = [];let finish!: () => void;let signal!: AbortSignal;
    const runtime = new ProviderWorkerRuntime(async (_request, current) => {
      signal = current;await new Promise<void>(resolve => { finish = resolve; });return "late";
    }, value => replies.push(value), () => undefined);
    const input = request(), pending = runtime.receive(input);
    await runtime.receive({ operation: "cancel", providerId: "qq", requestId: input.requestId });
    expect(signal.aborted).toBe(false);
    await runtime.receive({ operation: "cancel", providerId: "netease", requestId: input.requestId });
    expect(signal.aborted).toBe(true);finish();await pending;expect(replies).toEqual([]);
  });

  it("isolates platforms, prevents duplicate execution, and bounds concurrent tasks", async () => {
    let count = 0;const signals: AbortSignal[] = [], replies: ProviderWorkerResponse[] = [], finishes: (() => void)[] = [];
    const runtime = new ProviderWorkerRuntime(async (_request, signal) => {
      count++;signals.push(signal);await new Promise<void>(resolve => finishes.push(resolve));return [];
    }, reply => replies.push(reply), () => undefined);
    const first = request(), pending = [runtime.receive(first)];
    await runtime.receive(first);expect(count).toBe(1);
    await runtime.receive({ ...request(), providerId: "qq" });expect(count).toBe(1);
    expect(replies.at(-1)?.errorCode).toBe("PROVIDER_UNAVAILABLE");
    pending.push(runtime.receive(request()),runtime.receive(request()));
    await runtime.receive(request());expect(count).toBe(3);
    expect(replies.at(-1)?.errorCode).toBe("PROVIDER_RATE_LIMITED");
    runtime.dispose();expect(signals.every(signal => signal.aborted)).toBe(true);
    finishes.forEach(finish => finish());await Promise.all(pending);expect(replies.every(reply => !reply.ok)).toBe(true);
  });

  it("does not reflect error secrets or oversized/cyclic response data", async () => {
    const replies: ProviderWorkerResponse[] = [];
    const cyclic: Record<string, unknown> = {};cyclic.self = cyclic;
    for (const result of [new Error("private-token-must-not-escape"), "x".repeat(1024*1024), cyclic]) {
      const runtime = new ProviderWorkerRuntime(async () => { if(result instanceof Error) throw result;return result; }, r => replies.push(r), () => undefined);
      await runtime.receive(request());
    }
    expect(replies.map(r => r.errorCode)).toEqual(["PROVIDER_UNAVAILABLE","PROVIDER_API_CHANGED","PROVIDER_API_CHANGED"]);
    expect(JSON.stringify(replies)).not.toContain("private-token");
  });

  it("handles malformed input without crashing and refuses work after disposal", async () => {
    const cyclic: Record<string, unknown> = {};cyclic.self = cyclic;
    expect(parseWorkerRequest({ ...request(), payload: cyclic })).toBeUndefined();
    expect(parseWorkerRequest({ ...request(), payload: 1n })).toBeUndefined();
    expect(parseWorkerRequest({ ...request(), payload: "x".repeat(65537) })).toBeUndefined();
    expect(parseWorkerResponse({ requestId: randomUUID(), ok: true, value: cyclic })).toBeUndefined();
    let called = false, exited = false;const replies: ProviderWorkerResponse[] = [];
    const runtime = new ProviderWorkerRuntime(async () => { called = true; }, r => replies.push(r), () => { exited = true; });
    await runtime.receive({ operation: "unknown" });
    await runtime.receive({ ...request(), operation: "ping" });expect(replies.at(-1)?.value).toEqual({ ready: true });
    await runtime.receive({ ...request(), operation: "dispose" });
    await runtime.receive(request());expect(exited).toBe(true);expect(called).toBe(false);
  });
});
