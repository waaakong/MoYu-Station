import { describe, expect, it, vi } from "vitest";
import { DirectoryWatchManager } from "../src/audio/library/directoryWatchManager";

describe("directory watch manager", () => {
  it("debounces file events and reports watcher failures", async () => {
    vi.useFakeTimers();
    let listener: ((event: string, filename: string | Buffer | null) => void) | undefined;
    let errorListener: (() => void) | undefined;
    const close = vi.fn();
    const changed = vi.fn(async () => undefined);
    const attention = vi.fn();
    const manager = new DirectoryWatchManager(changed, attention, 1_500, (_path, nextListener) => {
      listener = nextListener;
      return { close, on: (_event, nextErrorListener) => { errorListener = nextErrorListener; } };
    });

    expect(manager.start({ id: "root-1", localPath: "C:\\Music" })).toBe(true);
    listener?.("change", "one.mp3");
    listener?.("change", "two.mp3");
    await vi.advanceTimersByTimeAsync(1_499);
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(changed).toHaveBeenCalledTimes(1);

    errorListener?.();
    expect(close).toHaveBeenCalledOnce();
    expect(attention).toHaveBeenCalledWith("root-1");
    vi.useRealTimers();
  });
});
