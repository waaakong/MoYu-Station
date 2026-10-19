import { describe, expect, it, vi } from "vitest";
import { createSceneIdlePrefetcher, loadSceneAsset, selectSceneSize } from "../src/scenes/sceneAssetLoader";

describe("scene asset loader", () => {
  it("selects standard for compact or low-performance windows", () => {
    expect(selectSceneSize(1280, false)).toBe("standard");
    expect(selectSceneSize(1920, true)).toBe("standard");
    expect(selectSceneSize(1600, false)).toBe("large");
  });

  it("falls back from WebP to JPEG without replacing the current image on total failure", async () => {
    const load = vi.fn(async (url: string) => {
      if (url.endsWith(".webp")) throw new Error("decode failed");
    });
    await expect(loadSceneAsset({ webp: "scene.webp", jpg: "scene.jpg" }, load)).resolves.toBe("scene.jpg");
    expect(load).toHaveBeenCalledTimes(2);
    await expect(loadSceneAsset({ webp: "scene.webp", jpg: "scene.jpg" }, async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  });

  it("limits idle prefetch to two active decodes and replaces stale queued work", async () => {
    const callbacks: Array<() => void> = [];
    const resolvers: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const load = vi.fn(() => new Promise<void>((resolve) => {
      active += 1;
      peak = Math.max(peak, active);
      resolvers.push(() => {
        active -= 1;
        resolve();
      });
    }));
    const prefetcher = createSceneIdlePrefetcher({
      load,
      scheduleIdle: (callback) => callbacks.push(callback) - 1,
      cancelIdle: vi.fn()
    });

    prefetcher.schedule([
      { webp: "stale-a.webp", jpg: "stale-a.jpg" },
      { webp: "stale-b.webp", jpg: "stale-b.jpg" }
    ]);
    prefetcher.schedule([
      { webp: "next-a.webp", jpg: "next-a.jpg" },
      { webp: "next-b.webp", jpg: "next-b.jpg" },
      { webp: "next-c.webp", jpg: "next-c.jpg" }
    ]);
    callbacks[0]();
    callbacks[1]();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).not.toHaveBeenCalledWith("stale-a.webp");
    expect(peak).toBe(2);

    resolvers.shift()?.();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(3));
    expect(peak).toBe(2);
    resolvers.splice(0).forEach((resolve) => resolve());
    prefetcher.dispose();
  });
});
