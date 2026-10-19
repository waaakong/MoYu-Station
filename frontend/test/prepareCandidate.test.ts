import { describe, expect, it, vi, afterEach } from "vitest";
import { createCandidatePreparer } from "../src/media/prepareCandidate";
import { processCandidate, type CandidateRuntime } from "../src/media/candidateProcessor";
import { solid } from "./helpers/candidateFixtures";

afterEach(() => vi.useRealTimers());
const file = () => new File(["fixture"], "local-private-name.png", { type: "image/png" });
function workerFixture() {
  return { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as Worker["onmessage"], onerror: null as Worker["onerror"], onmessageerror: null as Worker["onmessageerror"] };
}
function deliver(worker: ReturnType<typeof workerFixture>, data: unknown) { worker.onmessage?.call(worker as unknown as Worker, { data } as MessageEvent); }
const result = () => { const source = file(); return { file: source, width: 10, height: 10, originalBytes: source.size, outputBytes: source.size }; };

describe("disposable candidate worker admission", () => {
  it("serializes direct callers, terminates each worker, and returns its result", async () => {
    const first = workerFixture(), second = workerFixture(); const factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const prepare = createCandidatePreparer(factory); const signal = new AbortController().signal;
    const a = prepare(file(), signal), b = prepare(file(), signal);
    expect(factory).toHaveBeenCalledTimes(1); const output = result(); deliver(first, { ok: true, result: output });
    expect(await a).toBe(output); expect(first.terminate).toHaveBeenCalledOnce(); expect(factory).toHaveBeenCalledTimes(2);
    deliver(second, { ok: true, result: result() }); await b; expect(second.terminate).toHaveBeenCalledOnce();
  });
  it("cancels a queued file without starting it or disturbing the active worker", async () => {
    const worker = workerFixture(), factory = vi.fn(() => worker), prepare = createCandidatePreparer(factory);
    const a = prepare(file(), new AbortController().signal), controller = new AbortController();
    const b = prepare(file(), controller.signal); const failure = expect(b).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await failure; expect(worker.terminate).not.toHaveBeenCalled();
    deliver(worker, { ok: true, result: result() }); await a; expect(factory).toHaveBeenCalledOnce();
  });
  it("terminates active cancellation, ignores late replies, then processes the next file", async () => {
    const first = workerFixture(), second = workerFixture(), factory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const prepare = createCandidatePreparer(factory), controller = new AbortController();
    const a = prepare(file(), controller.signal), failure = expect(a).rejects.toMatchObject({ name: "AbortError" });
    const b = prepare(file(), new AbortController().signal); const late = first.onmessage!;
    controller.abort(); await failure; expect(first.terminate).toHaveBeenCalledOnce();
    late.call(first as unknown as Worker, { data: { ok: true, result: result() } } as MessageEvent);
    expect(second.terminate).not.toHaveBeenCalled(); deliver(second, { ok: true, result: result() }); await b;
  });
  it("times out a stuck worker and releases admission", async () => {
    vi.useFakeTimers(); const worker = workerFixture(), prepare = createCandidatePreparer(() => worker, 100);
    const pending = prepare(file(), new AbortController().signal); const failure = expect(pending).rejects.toMatchObject({ code: "MEDIA_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(100); await failure; expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it.each(["error", "messageerror", "malformed", "unsupported"])("cleans up on %s", async mode => {
    const worker = workerFixture(), prepare = createCandidatePreparer(() => { if (mode === "unsupported") throw new Error(); return worker; });
    const pending = prepare(file(), new AbortController().signal); const failure = expect(pending).rejects.toThrow();
    if (mode === "error") worker.onerror!.call(worker as unknown as Worker, { preventDefault() {} } as ErrorEvent);
    if (mode === "messageerror") worker.onmessageerror!.call(worker as unknown as Worker, {} as MessageEvent);
    if (mode === "malformed") deliver(worker, { ok: true, result: { ...result(), width: 9000 } });
    await failure; if (mode !== "unsupported") expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("rejects pre-aborted, invalid type and oversize input without worker creation", async () => {
    const factory = vi.fn(), prepare = createCandidatePreparer(factory), controller = new AbortController(); controller.abort();
    await expect(prepare(file(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    await expect(prepare(new File(["x"], "x.gif", { type: "image/gif" }), new AbortController().signal)).rejects.toThrow("真实");
    await expect(prepare(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }), new AbortController().signal)).rejects.toThrow("20 MiB");
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("candidate processing bounded failures", () => {
  async function fixture(encode: () => Promise<Blob>) {
    const bytes = await solid(64, 32), bitmap = { width: 64, height: 32, close: vi.fn() } as unknown as ImageBitmap;
    const context = { getContextAttributes: () => ({ colorSpace: "srgb" }), scale: vi.fn(), transform: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 64, height: 32, getContext: () => context, convertToBlob: vi.fn(encode) };
    const runtime = { decode: vi.fn(async () => bitmap), canvas: vi.fn(() => canvas) } as unknown as CandidateRuntime;
    return { source: new File([new Uint8Array(bytes)], "source.png", { type: "image/png" }), runtime, canvas, bitmap };
  }
  it("rejects invalid headers before attempting native decode", async () => {
    const f = await fixture(async () => new Blob());
    await expect(processCandidate(file(), f.runtime)).rejects.toThrow(); expect(f.runtime.decode).not.toHaveBeenCalled();
  });
  it("does not reduce dimensions or encode indefinitely to force an oversized result", async () => {
    let attempt = 0;
    const f = await fixture(async () => new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: attempt++ === 0 ? "image/png" : "image/webp" }));
    await expect(processCandidate(f.source, f.runtime)).rejects.toMatchObject({ code: "MEDIA_OUTPUT_SIZE" });
    expect(f.runtime.canvas).toHaveBeenCalledOnce(); expect(f.canvas.convertToBlob).toHaveBeenCalledTimes(4);
    expect(f.bitmap.close).toHaveBeenCalledOnce(); expect([f.canvas.width, f.canvas.height]).toEqual([0, 0]);
  });
  it("does not accept a browser codec fallback with a different MIME", async () => {
    const f = await fixture(async () => new Blob(["wrong"], { type: "image/jpeg" }));
    await expect(processCandidate(f.source, f.runtime)).rejects.toMatchObject({ code: "MEDIA_UNSUPPORTED" });
    expect(f.canvas.width).toBe(0); expect(f.bitmap.close).toHaveBeenCalledOnce();
  });
  it("closes the bitmap if canvas creation fails", async () => {
    const f = await fixture(async () => new Blob()); f.runtime.canvas = () => { throw new Error(); };
    await expect(processCandidate(f.source, f.runtime)).rejects.toThrow(); expect(f.bitmap.close).toHaveBeenCalledOnce();
  });
});
