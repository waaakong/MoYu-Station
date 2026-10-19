import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { ProviderWorkerMessage } from "../src/providers/core/providerWorkerProtocol";
import { ProviderWorkerSupervisor, type ProviderWorkerProcess } from "../src/providers/core/providerWorkerSupervisor";

class FakeWorker extends EventEmitter implements ProviderWorkerProcess {
  killed = false;
  postMessage(message: ProviderWorkerMessage): void {
    queueMicrotask(() => this.emit("message", { requestId: message.requestId, ok: true, value: message.operation }));
  }
  kill(): void { this.killed = true; }
}

describe("provider worker supervisor", () => {
  it.each(["PROVIDER_TIMEOUT","PROVIDER_RATE_LIMITED","PROVIDER_UNAVAILABLE","PROVIDER_RIGHTS_RESTRICTED"])("preserves retry classification for %s without passing raw errors",async code=>{
    const worker=new FakeWorker();worker.postMessage=message=>queueMicrotask(()=>worker.emit("message",{requestId:message.requestId,ok:false,errorCode:code}));
    const supervisor=new ProviderWorkerSupervisor("netease",()=>worker);
    await expect(supervisor.request("search")).rejects.toMatchObject({code,retryable:code!=="PROVIDER_RIGHTS_RESTRICTED"});supervisor.dispose();
  });
  it("starts lazily, correlates replies and disposes independently", async () => {
    let worker: FakeWorker | undefined;
    const supervisor = new ProviderWorkerSupervisor("qq", () => {
      worker = new FakeWorker();
      return worker;
    }, 100, 100);
    expect(worker).toBeUndefined();
    await expect(supervisor.request("ping")).resolves.toBe("ping");
    expect(worker).toBeDefined();
    supervisor.dispose();
    expect(worker?.killed).toBe(true);
  });

  it.each(['netease','qq','kugou'] as const)("rejects pending work when the %s worker crashes", async providerId => {
    let worker!: FakeWorker;
    const supervisor = new ProviderWorkerSupervisor(providerId, () => {
      worker = new FakeWorker();
      worker.postMessage = () => undefined;
      return worker;
    }, 1_000);
    const pending = supervisor.request("search");
    worker.emit("exit", 1);
    await expect(pending).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });

  it.each(['netease','qq','kugou'] as const)("sends cancellation to %s and ignores a late reply", async providerId => {
    const worker = new FakeWorker(), messages: ProviderWorkerMessage[] = [];
    worker.postMessage = message => { messages.push(message); };
    const supervisor = new ProviderWorkerSupervisor(providerId, () => worker);
    const controller = new AbortController();
    const request = supervisor.request("search", { query: "rain" }, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();await rejected;
    expect(messages[1]).toEqual({ operation: "cancel", providerId, requestId: messages[0]!.requestId });
    worker.emit("message", { requestId: messages[0]!.requestId, ok: true, value: "late" });
    supervisor.dispose();
  });

  it.each(['netease','qq','kugou'] as const)("%s timeout cancels real work, not only the parent promise", async providerId => {
    vi.useFakeTimers();
    const worker = new FakeWorker(), messages: ProviderWorkerMessage[] = [];
    worker.postMessage = message => { messages.push(message); };
    const supervisor = new ProviderWorkerSupervisor(providerId, () => worker, 100);
    try {
      const rejected = expect(supervisor.request("search")).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(100);await rejected;
      expect(messages[1]?.operation).toBe("cancel");
    } finally { supervisor.dispose();vi.useRealTimers(); }
  });

  it("cannot settle new work with a message from a retired process", async () => {
    const workers = [new FakeWorker(), new FakeWorker()];let launched = 0;
    const messages: ProviderWorkerMessage[] = [];
    workers.forEach(worker => { worker.postMessage = message => { messages.push(message); }; });
    const supervisor = new ProviderWorkerSupervisor("qq", () => workers[launched++]!);
    const oldRejected = expect(supervisor.request("search")).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    supervisor.dispose();await oldRejected;
    const current = supervisor.request("ping"), requestId = messages.at(-1)!.requestId;
    workers[0]!.emit("message", { requestId, ok: true, value: "old" });
    workers[0]!.emit("exit", 1);
    workers[1]!.emit("message", { requestId, ok: true, value: "current" });
    await expect(current).resolves.toBe("current");supervisor.dispose();
  });

  it("kills a process when a cancellation control message cannot be sent", async () => {
    const worker = new FakeWorker();
    worker.postMessage = message => { if (message.operation === "cancel") throw new Error("closed"); };
    const supervisor = new ProviderWorkerSupervisor("qq", () => worker);
    const controller = new AbortController();
    const pending = expect(supervisor.request("search", {}, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();await pending;expect(worker.killed).toBe(true);
  });
});
