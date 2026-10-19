import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { QueueItem } from "@studyroom/contracts";
import { useQueueStore } from "../src/stores/queue";
const item = (id: string): QueueItem => ({ id, queuedAt: 1, track: { id, title: id, artist: "Test", source: { kind: "builtin", assetId: "/test.wav" } } });
const replaceQueue = vi.fn();
beforeEach(() => { setActivePinia(createPinia()); replaceQueue.mockReset(); vi.stubGlobal("window", { studyRoomDesktop: { replaceQueue } }); });
afterEach(() => vi.unstubAllGlobals());
it("serializes snapshots; an older failed write cannot roll back a newer queue", async () => {
  let reject!: (error: Error) => void;
  replaceQueue.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValueOnce(undefined);
  const queue = useQueueStore();
  const old = queue.replace([item("a")]).catch(() => undefined);
  const next = queue.replace([item("b")]);
  await Promise.resolve();
  expect(replaceQueue).toHaveBeenCalledTimes(1); expect(queue.persisting).toBe(true);
  reject(new Error("DISK_FULL")); await old; await next;
  expect(replaceQueue.mock.calls.map(([items]) => items[0].id)).toEqual(["a", "b"]);
  expect(queue.items[0].id).toBe("b"); expect(queue.persisting).toBe(false);
});
it("two failed writes restore the last durable queue, not an unsaved intermediate queue", async () => {
  const queue = useQueueStore(); queue.items = [item("saved")];
  replaceQueue.mockRejectedValue(new Error("DISK_FULL"));
  const results = await Promise.allSettled([queue.replace([item("a")]), queue.replace([item("b")])]);
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(queue.items[0].id).toBe("saved"); expect(queue.persisting).toBe(false);
});
it("a late initial read cannot overwrite an explicit new queue", async () => {
  let resolve!: (items: QueueItem[]) => void;
  window.studyRoomDesktop!.readQueue = () => new Promise((done) => { resolve = done; });
  replaceQueue.mockResolvedValue(undefined);
  const queue = useQueueStore(); const reading = queue.hydrate();
  await queue.replace([item("new")]); resolve([item("old")]); await reading;
  expect(queue.items[0].id).toBe("new"); expect(queue.hydrated).toBe(true);
});
