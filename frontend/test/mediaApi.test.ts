import { describe, expect, it, vi } from "vitest";
import { MediaApi, MediaProtocolError, type MediaTransport, type PublicationCommand, type SessionStamp } from "../src/media/mediaApi";
import { MediaPublicationTask } from "../src/media/mediaPublicationTask";
import { UploadTerminalError, UploadRejectedError, type UploadJob } from "../src/media/imageUploadQueue";
const ID = "11111111-1111-4111-8111-111111111111", ASSET = "22222222-2222-4222-8222-222222222222";
const stamp: SessionStamp = { accountId: "1", generation: 1 };
const body = (data: unknown, status = 200) => ({ status, data: { success: true, data } });
const ready = () => ({ status: "ready", asset: { id: ASSET, expiresAt: 9999999999999, width: 100, height: 200,
  mime: "image/webp", bytes: 100, clearUrl: `/api/media/assets/${ASSET}/clear`, thumbUrl: `/api/media/assets/${ASSET}/thumb` }, code: null, retryable: false });
const job = (): UploadJob => ({ requestId: ID, attachmentId: ID, scope: { accountId: "1", target: { kind: "private", recipientId: "2" } }, signal: new AbortController().signal });
const file = () => new File(["test"], "image.webp", { type: "image/webp" });
const command = (): PublicationCommand => ({ requestId: ID, kind: "PRIVATE", recipient: 2, content: "hello", scene: null, assets: [ASSET] });
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => resolve = r); return { promise, resolve }; }

describe("media API contract", () => {
  it("sends raw candidate and validates exact controlled resource paths", async () => {
    const transport = vi.fn<MediaTransport>().mockResolvedValue(body(ready())); const api = new MediaApi(stamp, () => stamp, transport);
    const image = file(); expect(await api.upload(image, job())).toEqual({ id: ASSET, expiresAt: 9999999999999 });
    expect(transport.mock.calls[0][0]).toMatchObject({ method: "POST", path: `/media/assets?clientUploadId=${ID}`, body: image, mime: "image/webp" });
    expect(transport.mock.calls[0][0].body).not.toBeInstanceOf(FormData);
  });
  it.each(["clearUrl", "thumbUrl", "id", "width", "bytes", "mime", "expiresAt"])("rejects malformed receipt %s", async key => {
    const data = ready(); (data.asset as Record<string, unknown>)[key] = key.endsWith("Url") ? "https://external.invalid/image" : null;
    const api = new MediaApi(stamp, () => stamp, async () => body(data));
    await expect(api.upload(file(), job())).rejects.toBeInstanceOf(MediaProtocolError);
  });
  it("distinguishes retryable failure from terminal states and pending", async () => {
    for (const status of ["expired", "bound", "failed"] as const) {
      const api = new MediaApi(stamp, () => stamp, async () => body({ status, asset: null, code: "MEDIA_FAILED", retryable: false }));
      await expect(api.upload(file(), job())).rejects.toBeInstanceOf(UploadTerminalError);
    }
    const retry = new MediaApi(stamp, () => stamp, async () => body({ status: "failed", asset: null, code: "MEDIA_BUSY", retryable: true }));
    await expect(retry.upload(file(), job())).rejects.toBeInstanceOf(UploadRejectedError);
    const pending = new MediaApi(stamp, () => stamp, async () => body({ status: "pending", asset: null, retryable: false }));
    await expect(pending.upload(file(), job())).rejects.toThrow("UNKNOWN");
  });
  it("rejects wrong account, invalid candidate and cancelled work before transport", async () => {
    const transport = vi.fn<MediaTransport>(); const api = new MediaApi(stamp, () => stamp, transport);
    await expect(api.upload(file(), { ...job(), scope: { accountId: "2", target: { kind: "feed" } } })).rejects.toMatchObject({ name: "AbortError" });
    await expect(api.upload(new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }), job())).rejects.toBeInstanceOf(UploadTerminalError);
    const controller = new AbortController(); controller.abort();
    await expect(api.lookupUpload({ ...job(), signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("ignores late results even after account A switches back to A", async () => {
    let current = stamp; const pending = gate<Awaited<ReturnType<MediaTransport>>>();
    const api = new MediaApi(stamp, () => current, () => pending.promise); const request = api.upload(file(), job());
    current = { accountId: "1", generation: 3 }; pending.resolve(body(ready()));
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("never maps HTTP or malformed lookup failures into missing", async () => {
    for (const response of [{ status: 503, data: {} }, body({ status: "missing", asset: { id: ASSET }, retryable: false }), body({})]) {
      await expect(new MediaApi(stamp, () => stamp, async () => response).lookupUpload(job())).rejects.toBeInstanceOf(MediaProtocolError);
    }
  });
});

describe("immutable publication task", () => {
  it("does not send until explicit submit and freezes recipient/content/order", async () => {
    const transport = vi.fn<MediaTransport>().mockResolvedValue(body({ kind: "PRIVATE", targetId: 42 }));
    const mutable = { ...command(), assets: [ASSET] }; const task = new MediaPublicationTask(new MediaApi(stamp, () => stamp, transport), mutable);
    mutable.recipient = 3; mutable.content = "changed"; mutable.assets.length = 0;
    expect(transport).not.toHaveBeenCalled(); await task.submit(); await task.submit();
    expect(transport).toHaveBeenCalledTimes(1); expect(JSON.parse(transport.mock.calls[0][0].body as string)).toEqual(command());
    expect(task.snapshot().status).toBe("committed");
  });
  it("queries unknown outcome and uses committed result without replay", async () => {
    const transport = vi.fn<MediaTransport>().mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(body({ status: "committed", publication: { kind: "PRIVATE", targetId: 42 } }));
    const task = new MediaPublicationTask(new MediaApi(stamp, () => stamp, transport), command());
    await expect(task.submit()).rejects.toThrow("timeout"); expect(task.snapshot().status).toBe("unknown");
    expect(await task.submit()).toEqual({ kind: "PRIVATE", targetId: "42" });
    expect(transport.mock.calls.map(([r]) => r.method)).toEqual(["POST", "GET"]);
  });
  it("only explicitly retries the identical body after unconfirmed", async () => {
    const transport = vi.fn<MediaTransport>().mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(body({ status: "unconfirmed", publication: null })).mockResolvedValueOnce(body({ kind: "PRIVATE", targetId: 42 }));
    const task = new MediaPublicationTask(new MediaApi(stamp, () => stamp, transport), command());
    await expect(task.submit()).rejects.toThrow(); expect(transport).toHaveBeenCalledTimes(1);
    await task.submit(); expect(transport.mock.calls[2][0].body).toBe(transport.mock.calls[0][0].body);
  });
  it("does not replay after failed lookup, conflict or mismatched success kind", async () => {
    const transport = vi.fn<MediaTransport>().mockRejectedValue(new Error("offline"));
    const task = new MediaPublicationTask(new MediaApi(stamp, () => stamp, transport), command());
    await expect(task.submit()).rejects.toThrow(); await expect(task.submit()).rejects.toThrow();
    expect(transport.mock.calls.map(([r]) => r.method)).toEqual(["POST", "GET"]);
    const rejected = vi.fn<MediaTransport>().mockRejectedValue({ status: 409, code: "MEDIA_PUBLICATION_CONFLICT" });
    const conflict = new MediaPublicationTask(new MediaApi(stamp, () => stamp, rejected), command());
    await expect(conflict.submit()).rejects.toThrow(); await expect(conflict.submit()).rejects.toThrow(); expect(rejected).toHaveBeenCalledTimes(1);
    const invalid = new MediaApi(stamp, () => stamp, async () => body({ kind: "HALL", targetId: 42 }));
    await expect(invalid.publish(command(), new AbortController().signal)).rejects.toBeInstanceOf(MediaProtocolError);
  });
  it("coalesces concurrent clicks and discards cancellation during ignored abort", async () => {
    const pending = gate<Awaited<ReturnType<MediaTransport>>>(); const transport = vi.fn<MediaTransport>(() => pending.promise);
    const task = new MediaPublicationTask(new MediaApi(stamp, () => stamp, transport), command());
    const first = task.submit(), second = task.submit(); expect(first).toBe(second); task.cancel(); pending.resolve(body({ kind: "PRIVATE", targetId: 42 }));
    await expect(first).rejects.toMatchObject({ name: "AbortError" }); expect(task.snapshot()).toEqual({ status: "cancelled", publication: undefined });
  });
});
