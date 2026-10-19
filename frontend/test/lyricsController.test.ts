import { describe, expect, it, vi } from "vitest";
import { LyricsController } from "../src/audio/lyrics/lyricsController";

describe("LyricsController", () => {
  it("clear settles a hanging read and releases its timeout", async () => {
    vi.useFakeTimers();
    try {
      const controller = new LyricsController();
      const pending = controller.load('old', () => new Promise(() => {}), async () => 0);
      controller.clear(); await pending;
      expect(controller.snapshot().trackId).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("a stale rejection cannot clear a newer track", async () => {
    const controller = new LyricsController(); let fail!: (error: Error) => void;
    const old = controller.load('old', () => new Promise((_, reject) => { fail = reject; }), async () => 0);
    await controller.load('new', async () => ({ trackId: 'new', content: '[00:00]New', source: 'sidecar' }), async () => 0);
    fail(new Error('OLD_FILE_REMOVED')); await old;
    expect(controller.snapshot()).toMatchObject({ trackId: 'new', loading: false });
    expect(controller.snapshot().lines[0]?.text).toBe('New');
  });
  it("times out hung reads and recovers on an explicit retry", async () => {
    vi.useFakeTimers();
    try {
      const controller = new LyricsController();
      const pending = controller.load('one', () => new Promise(() => {}), async () => 0);
      const rejection = expect(pending).rejects.toThrow('LYRICS_READ_TIMEOUT');
      await vi.advanceTimersByTimeAsync(15000); await rejection;
      expect(controller.snapshot().loading).toBe(false);
      await controller.load('one', async () => undefined, async () => Number.NaN);
      expect(controller.snapshot().offsetMs).toBe(0); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it("finds the active line with a bounded half-second offset", async () => {
    const controller = new LyricsController();
    await controller.load(
      "track-1",
      async () => ({ trackId: "track-1", content: "[00:01]One\n[00:03]Three", source: "sidecar" }),
      async () => 250
    );
    expect(controller.snapshot().offsetMs).toBe(250);
    expect(controller.update(800)).toBe(-1);
    expect(controller.update(1_250)).toBe(0);
    expect(controller.setOffset(10_400)).toBe(10_000);
    expect(controller.setOffset(-10_400)).toBe(-10_000);
    expect(controller.setOffset(740)).toBe(500);
  });

  it("ignores a stale async result after the track changes", async () => {
    const controller = new LyricsController();
    let release: ((value: { trackId: string; content: string; source: "embedded" }) => void) | undefined;
    const stale = controller.load(
      "track-old",
      () => new Promise((resolve) => { release = resolve; }),
      async () => 0
    );
    const current = controller.load("track-new", async () => undefined, async () => 0);
    await current;
    release?.({ trackId: "track-old", content: "[00:01]Old", source: "embedded" });
    await stale;
    expect(controller.snapshot()).toMatchObject({ trackId: "track-new", lines: [], loading: false });
  });
});
