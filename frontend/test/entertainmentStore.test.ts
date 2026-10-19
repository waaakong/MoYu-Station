import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useEntertainmentStore } from "../src/stores/entertainment";

function installBrowserStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear()
  } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
}

describe("entertainment store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installBrowserStorage();
    delete window.studyRoomDesktop;
    setActivePinia(createPinia());
  });

  it("loads defaults and persists independent tools without a server", async () => {
    const fetchSpy = vi.fn();
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchSpy });
    const store = useEntertainmentStore();
    await store.initialize();
    store.hitWoodenFish();
    store.setPreference("solidBackground", true);
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(localStorage.getItem("studyroom-entertainment-v1:wooden-fish")!)).toMatchObject({ count: 1 });
    expect(JSON.parse(localStorage.getItem("studyroom-entertainment-v1:preferences")!)).toMatchObject({ solidBackground: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    store.dispose();
  });

  it("coalesces wooden-fish writes and flushes pending state", async () => {
    const setItem = vi.spyOn(localStorage, "setItem");
    const store = useEntertainmentStore();
    await store.initialize();
    store.hitWoodenFish();
    store.hitWoodenFish();
    store.hitWoodenFish();
    expect(setItem).not.toHaveBeenCalled();
    await store.flush();
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(store.woodenFish.count).toBe(3);
    store.dispose();
  });

  it("keeps multiple pause reasons until each one clears", async () => {
    const store = useEntertainmentStore();
    await store.initialize();
    store.setPauseReason("hidden", true);
    store.setPauseReason("blurred", true);
    store.setPauseReason("hidden", false);
    expect(store.paused).toBe(true);
    expect(store.pauseReasons).toEqual(["blurred"]);
    store.setPauseReason("blurred", false);
    expect(store.paused).toBe(false);
    store.dispose();
  });

  it("settles a revealed memory pair before lifecycle pause", async () => {
    const store = useEntertainmentStore();
    await store.initialize();
    store.startMemoryGame(() => 0.25);
    store.revealMemory(store.memoryCards.cards[0].id);
    store.revealMemory(store.memoryCards.cards[1].id);

    expect(store.memoryCards.revealedIds).toHaveLength(2);
    store.setPauseReason("hidden", true);

    expect(store.memoryCards.revealedIds).toHaveLength(0);
    expect(store.memoryCards.status).toBe("paused");
    store.dispose();
  });
});
