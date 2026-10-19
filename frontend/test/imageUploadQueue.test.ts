import { describe, expect, it, vi } from "vitest";
import {
  createImageUploadScheduler, ImageUploadQueue, UploadRejectedError,
  type AssetReceipt, type ImageUploadDependencies, type UploadJob, type UploadScope
} from "../src/media/imageUploadQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const file = (name = "image.png") => new File(["test"], name, { type: "image/png" });
const scope: UploadScope = { accountId: "user-a", target: { kind: "private", recipientId: "peer-a" } };
const receipt = (id = "asset-a"): AssetReceipt => ({ id, expiresAt: 10_000 });
const eventually = (assertion: () => void) => vi.waitFor(assertion, { interval: 1, timeout: 2000 });
function harness(overrides: Partial<ImageUploadDependencies> = {}, initialScope = scope) {
  let nextId = 0;
  const prepare = vi.fn(async (source: File) => source);
  const upload = vi.fn(async (_source: File, job: UploadJob) => receipt(`asset-${job.attachmentId}`));
  const lookup = vi.fn(async () => ({ status: "missing" as const }));
  const revokePreview = vi.fn();
  const createPreview = vi.fn((source: File) => `blob:${source.name}`);
  const deps = { prepare, upload, lookup, createPreview, revokePreview, now: () => 100,
    createId: () => `id-${++nextId}`, scheduler: createImageUploadScheduler(), ...overrides };
  return { queue: new ImageUploadQueue(initialScope, deps), prepare, upload, lookup, createPreview, revokePreview };
}

describe("image upload queue", () => {
  it("serial admission keeps a batch out of a single-slot backend until the preceding upload settles", async () => {
    const scheduler = createImageUploadScheduler(1), gate = deferred<AssetReceipt>();
    const upload = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(receipt('second'));
    const first = harness({scheduler, upload}), second = harness({scheduler, upload});
    first.queue.add([file()]); second.queue.add([file()]);
    await eventually(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(second.queue.snapshot()[0].status).toBe('queued');
    gate.resolve(receipt());
    await eventually(() => expect(second.queue.snapshot()[0].status).toBe('ready'));
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it.each(["expired", "bound", "failed"] as const)("does not retry terminal lookup %s", async status => {
    const upload = vi.fn().mockRejectedValue(new Error("unknown"));
    const lookup = vi.fn().mockResolvedValue({ status, retryable: false, code: "MEDIA_STORAGE_FAILED" });
    const h = harness({ upload, lookup });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("OUTCOME_UNKNOWN"));
    h.queue.retry(id);
    const expected = status === "expired" ? "ASSET_EXPIRED" : status === "bound" ? "ASSET_BOUND" : "UPLOAD_TERMINAL";
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe(expected));
    h.queue.retry(id); expect(upload).toHaveBeenCalledTimes(1); expect(lookup).toHaveBeenCalledTimes(1);
  });
  it("reuses original candidate and request ID after authoritative retryable lookup", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error("unknown")).mockResolvedValueOnce(receipt());
    const h = harness({ upload, lookup: vi.fn().mockResolvedValue({ status: "failed", retryable: true, code: "MEDIA_BUSY" }) });
    const [id] = h.queue.add([file()]); await eventually(() => expect(h.queue.snapshot()[0].error).toBe("OUTCOME_UNKNOWN"));
    h.queue.retry(id); await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(upload.mock.calls[0][0]).toBe(upload.mock.calls[1][0]); expect(upload.mock.calls[0][1]).toBe(upload.mock.calls[1][1]);
  });
  it("prepares and uploads with stable IDs, immutable account and recipient snapshots", async () => {
    const mutable: UploadScope = { accountId: "user-a", target: { kind: "private", recipientId: "peer-a" } };
    const h = harness({}, mutable);
    const [id] = h.queue.add([file()]);
    mutable.accountId = "user-b";
    if (mutable.target.kind === "private") mutable.target.recipientId = "peer-b";
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    const job = h.upload.mock.calls[0][1];
    expect(job.scope).toEqual(scope);
    expect(Object.isFrozen(job.scope.target)).toBe(true);
    expect(job.attachmentId).toBe(id);
    expect(h.queue.assetsForPublish()).toEqual([`asset-${id}`]);
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("rejects over-nine batches atomically, without decoding or truncation", async () => {
    const h = harness();
    expect(() => h.queue.add(Array.from({ length: 10 }, () => file()))).toThrow("本批未添加");
    expect(h.queue.snapshot()).toHaveLength(0);
    expect(h.createPreview).not.toHaveBeenCalled();
    h.queue.add(Array.from({ length: 8 }, () => file()));
    expect(() => h.queue.add([file(), file()])).toThrow("9");
    expect(h.queue.snapshot()).toHaveLength(8);
    h.queue.dispose();
  });

  it("validates the entire batch and releases previews on a partial creation failure", () => {
    const h = harness();
    expect(() => h.queue.add([file(), new File(["x"], "x.gif", { type: "image/gif" })])).toThrow("仅支持");
    expect(h.createPreview).not.toHaveBeenCalled();
    h.createPreview.mockImplementationOnce(() => "blob:one").mockImplementationOnce(() => { throw new Error("preview failed"); });
    expect(() => h.queue.add([file(), file()])).toThrow("preview failed");
    expect(h.revokePreview).toHaveBeenCalledExactlyOnceWith("blob:one");
    expect(h.queue.snapshot()).toEqual([]);
  });

  it("shares a single processing slot across multiple queues", async () => {
    const gate = deferred<File>();
    const scheduler = createImageUploadScheduler();
    const prepare = vi.fn().mockImplementationOnce(() => gate.promise).mockImplementation(async (source: File) => source);
    const first = harness({ scheduler, prepare }), second = harness({ scheduler, prepare });
    first.queue.add([file("one.png"), file("two.png")]);
    second.queue.add([file("three.png")]);
    await eventually(() => expect(prepare).toHaveBeenCalledTimes(1));
    expect(first.queue.snapshot()[1].status).toBe("queued");
    expect(second.queue.snapshot()[0].status).toBe("queued");
    gate.resolve(file());
    await eventually(() => expect(prepare).toHaveBeenCalledTimes(3));
    await eventually(() => expect(second.queue.snapshot()[0].status).toBe("ready"));
  });

  it("allows only two network requests across queues and holds cancelled active slots until settled", async () => {
    const scheduler = createImageUploadScheduler();
    const gates = [deferred<AssetReceipt>(), deferred<AssetReceipt>(), deferred<AssetReceipt>()];
    const upload = vi.fn().mockImplementationOnce(() => gates[0].promise).mockImplementationOnce(() => gates[1].promise).mockImplementationOnce(() => gates[2].promise);
    const first = harness({ scheduler, upload }), second = harness({ scheduler, upload });
    const [firstId] = first.queue.add([file(), file()]);
    second.queue.add([file()]);
    await eventually(() => expect(upload).toHaveBeenCalledTimes(2));
    first.queue.remove(firstId);
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(upload).toHaveBeenCalledTimes(2);
    gates[0].resolve(receipt());
    await eventually(() => expect(upload).toHaveBeenCalledTimes(3));
    gates[1].resolve(receipt()); gates[2].resolve(receipt());
    await eventually(() => expect(second.queue.snapshot()[0].status).toBe("ready"));
    expect(first.queue.snapshot()).toHaveLength(1);
  });

  it("never starts removed queued work", async () => {
    const gate = deferred<File>();
    const prepare = vi.fn(() => gate.promise);
    const h = harness({ prepare });
    const [, second] = h.queue.add([file(), file()]);
    h.queue.remove(second);
    await eventually(() => expect(prepare).toHaveBeenCalledTimes(1));
    gate.resolve(file());
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("retries processing only on explicit action and then uploads once", async () => {
    const prepare = vi.fn().mockRejectedValueOnce(new Error("decode")).mockResolvedValue(file());
    const h = harness({ prepare });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("PROCESSING_FAILED"));
    expect(h.upload).not.toHaveBeenCalled();
    h.queue.retry(id); h.queue.retry(id);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(h.upload).toHaveBeenCalledTimes(1);
  });

  it("retries a definitive rejection with the same request ID and no second processing", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new UploadRejectedError("rejected")).mockResolvedValue(receipt());
    const h = harness({ upload });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("UPLOAD_REJECTED"));
    h.queue.retry(id);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(upload.mock.calls[0][1].requestId).toBe(upload.mock.calls[1][1].requestId);
    expect(h.prepare).toHaveBeenCalledTimes(1);
    expect(h.lookup).not.toHaveBeenCalled();
  });

  it("queries an unknown upload result and accepts its asset without re-upload", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("timeout"));
    const lookup = vi.fn().mockResolvedValue({ status: "ready", asset: receipt("existing") });
    const h = harness({ upload, lookup });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("OUTCOME_UNKNOWN"));
    expect(lookup).not.toHaveBeenCalled();
    h.queue.retry(id); h.queue.retry(id);
    await eventually(() => expect(h.queue.assetsForPublish()).toEqual(["existing"]));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0][0].requestId).toBe(upload.mock.calls[0][1].requestId);
  });

  it.each(["pending", "lookup-error", "malformed"])("does not re-upload for %s lookup", async outcome => {
    const upload = vi.fn().mockRejectedValue(new Error("timeout"));
    const lookup = vi.fn().mockImplementation(async () => {
      if (outcome === "lookup-error") throw new UploadRejectedError("query failed, not an upload rejection");
      return outcome === "pending" ? { status: "pending" } : { status: "wrong" };
    });
    const h = harness({ upload, lookup });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("failed"));
    h.queue.retry(id);
    await eventually(() => expect(lookup).toHaveBeenCalledTimes(1));
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("OUTCOME_UNKNOWN"));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("re-uploads with the same ID only after an authoritative missing result", async () => {
    const upload = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(receipt());
    const h = harness({ upload });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("failed"));
    h.queue.retry(id);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(h.lookup).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1].requestId).toBe(upload.mock.calls[1][1].requestId);
  });

  it.each(["remove", "cancel", "reset", "dispose"] as const)("ignores a late upload after %s", async action => {
    const gate = deferred<AssetReceipt>();
    const upload = vi.fn((_source: File, _job: UploadJob) => gate.promise);
    const h = harness({ upload });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(upload).toHaveBeenCalledTimes(1));
    if (action === "reset") h.queue.reset({ accountId: "user-b", target: { kind: "feed" } });
    else if (action === "dispose") h.queue.dispose();
    else h.queue[action](id);
    gate.resolve(receipt("old-account-asset"));
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(upload.mock.calls[0][1].signal.aborted).toBe(true);
    if (action === "cancel") {
      expect(h.queue.snapshot()[0]).toMatchObject({ status: "cancelled", previewUrl: "", asset: undefined });
      expect(() => h.queue.assetsForPublish()).toThrow("未就绪");
    } else expect(h.queue.snapshot()).toEqual([]);
    expect(h.revokePreview).toHaveBeenCalledTimes(1);
  });

  it("a late processing result cannot upload under a new account", async () => {
    const gate = deferred<File>();
    const prepare = vi.fn().mockImplementationOnce(() => gate.promise).mockResolvedValue(file());
    const h = harness({ prepare });
    h.queue.add([file()]);
    await eventually(() => expect(prepare).toHaveBeenCalledTimes(1));
    h.queue.reset({ accountId: "new-account", target: { kind: "feed" } });
    h.queue.add([file()]);
    gate.resolve(file());
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(h.upload).toHaveBeenCalledTimes(1);
    expect(h.upload.mock.calls[0][1].scope.accountId).toBe("new-account");
  });

  it("emits asset IDs in explicit attachment order, independent of completion order", async () => {
    const first = deferred<AssetReceipt>();
    const upload = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(receipt("second"));
    const h = harness({ upload });
    const ids = h.queue.add([file("a.png"), file("b.png")]);
    h.queue.reorder([...ids].reverse());
    expect(() => h.queue.reorder([ids[0], ids[0]])).toThrow("无效");
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    expect(() => h.queue.assetsForPublish()).toThrow("全部");
    first.resolve(receipt("first"));
    await eventually(() => expect(h.queue.assetsForPublish()).toEqual(["second", "first"]));
    const copy = h.queue.snapshot();
    (copy[0].asset as AssetReceipt).id = "tampered";
    expect(h.queue.assetsForPublish()).toEqual(["second", "first"]);
  });

  it("checks expiry again at publish time, blocks retry, and allows text-only empty lists", async () => {
    let now = 100;
    const h = harness({ now: () => now });
    expect(h.queue.assetsForPublish()).toEqual([]);
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    now = 10_000;
    expect(() => h.queue.assetsForPublish()).toThrow("过期");
    h.queue.retry(id);
    expect(h.queue.snapshot()[0].error).toBe("ASSET_EXPIRED");
    expect(h.upload).toHaveBeenCalledTimes(1);
  });

  it("releases previews exactly once and is terminal after dispose", async () => {
    const h = harness();
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("ready"));
    const listener = vi.fn(); h.queue.subscribe(listener);
    h.queue.cancel(id); h.queue.remove(id); h.queue.dispose(); h.queue.dispose();
    expect(h.revokePreview).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(() => h.queue.add([file()])).toThrow("关闭");
  });

  it("a removed lookup cannot resurrect the item or start another upload", async () => {
    const result = deferred<{ status: "missing" }>();
    const lookup = vi.fn((_job: UploadJob) => result.promise);
    const upload = vi.fn().mockRejectedValue(new Error("unknown"));
    const h = harness({ lookup, upload });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].status).toBe("failed"));
    h.queue.retry(id);
    await eventually(() => expect(lookup).toHaveBeenCalledTimes(1));
    h.queue.remove(id);
    result.resolve({ status: "missing" });
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(lookup.mock.calls[0][0].signal.aborted).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(h.queue.snapshot()).toEqual([]);
  });

  it("rejects a receipt already expired without automatic re-upload", async () => {
    const upload = vi.fn().mockResolvedValue({ id: "old", expiresAt: 99 });
    const h = harness({ upload });
    const [id] = h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("ASSET_EXPIRED"));
    h.queue.retry(id);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(h.queue.snapshot()[0].asset).toBeUndefined();
  });

  it("a malformed success receipt is unknown, not a successful upload", async () => {
    const upload = vi.fn().mockResolvedValue({ id: 42, expiresAt: null });
    const h = harness({ upload });
    h.queue.add([file()]);
    await eventually(() => expect(h.queue.snapshot()[0].error).toBe("OUTCOME_UNKNOWN"));
    expect(() => h.queue.assetsForPublish()).toThrow("未就绪");
  });

  it("does not start an upload cancelled by a synchronous account observer", async () => {
    const h = harness();
    h.queue.subscribe(() => {
      const active = h.queue.snapshot().find(item => item.status === "uploading");
      if (active) h.queue.reset({ accountId: "other", target: { kind: "feed" } });
    });
    h.queue.add([file()]);
    await eventually(() => expect(h.prepare).toHaveBeenCalledTimes(1));
    await eventually(() => expect(h.queue.snapshot()).toEqual([]));
    expect(h.upload).not.toHaveBeenCalled();
  });
});
