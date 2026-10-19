import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { sanitizeScenePreferences, useSceneStore } from "../src/stores/scene";

describe("scene preference migration", () => {
  it("restores legal values and rejects custom, unknown versions and damaged input", () => {
    expect(sanitizeScenePreferences({ version: 3, sceneKey: "forest", timeKey: "dusk", timeMode: "smart" }, new Date("2026-09-14T12:00:00"))).toMatchObject({ sceneKey: "forest", timeKey: "dusk", timeMode: "smart" });
    expect(sanitizeScenePreferences({ version: 3, sceneKey: "custom", timeKey: "dusk", timeMode: "always" }, new Date("2026-09-14T12:00:00"))).toMatchObject({ sceneKey: "mountain", timeKey: "noon", timeMode: "manual" });
    expect(sanitizeScenePreferences({ version: 99 }, new Date("2026-09-14T23:00:00"))).toMatchObject({ sceneKey: "mountain", timeKey: "midnight", timeMode: "manual" });
  });
});

describe("three-level scene following", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("locks smart following for the full focus session but keeps manual changes", () => {
    const store = useSceneStore();
    store.replacePreferences({ version: 3, sceneKey: "forest", timeKey: "morning", timeMode: "smart" });
    store.beginFocusSession("record-1");
    store.syncSystemTime(new Date("2026-09-14T19:00:00"));
    expect(store.timeKey).toBe("morning");
    store.setTime("afternoon");
    expect(store.focusSnapshot).toMatchObject({ sceneKey: "forest", timeKey: "afternoon" });
    store.endFocusSession(new Date("2026-09-14T19:00:00"));
    expect(store.timeKey).toBe("night");
  });

  it("always follows during focus while manual never follows", () => {
    const store = useSceneStore();
    store.setMode("always", new Date("2026-09-14T06:00:00"));
    store.beginFocusSession("record-2");
    store.syncSystemTime(new Date("2026-09-14T23:00:00"));
    expect(store.timeKey).toBe("midnight");
    store.endFocusSession();
    store.setMode("manual");
    store.syncSystemTime(new Date("2026-09-14T09:00:00"));
    expect(store.timeKey).toBe("midnight");
  });

  it("restores a legal focus snapshot without changing the selected follow mode", () => {
    const store = useSceneStore();
    store.replacePreferences({ version: 3, sceneKey: "mountain", timeKey: "morning", timeMode: "smart" });
    expect(store.restoreFocusSession({ sessionId: "saved-1", sceneKey: "library", timeKey: "night" })).toBe(true);
    expect(store.timeMode).toBe("smart");
    expect(store.focusSnapshot).toEqual({ sessionId: "saved-1", sceneKey: "library", timeKey: "night" });
    expect(store.sceneKey).toBe("library");
    expect(store.timeKey).toBe("night");
  });

  it("rejects damaged focus snapshots without contaminating preferences", () => {
    const store = useSceneStore();
    store.replacePreferences({ version: 3, sceneKey: "forest", timeKey: "dusk", timeMode: "manual" });
    expect(store.restoreFocusSession({ sessionId: "saved-2", sceneKey: "custom", timeKey: "unknown" })).toBe(false);
    expect(store.focusSnapshot).toBeNull();
    expect(store.sceneKey).toBe("forest");
    expect(store.timeKey).toBe("dusk");
  });
});
