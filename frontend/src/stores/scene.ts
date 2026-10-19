import { defineStore } from "pinia";
import { timeFromSystem } from "../data/scenes";
import type { SceneKey, SceneSizeKey, SceneTimeKey, SceneTimeMode } from "../scenes/sceneAssetCatalog";
import { selectSceneSize } from "../scenes/sceneAssetLoader";

export interface ScenePreferences {
  version: 3;
  sceneKey: SceneKey;
  timeKey: SceneTimeKey;
  timeMode: SceneTimeMode;
}

export interface FocusSceneSnapshot {
  sessionId: string;
  sceneKey: SceneKey;
  timeKey: SceneTimeKey;
}

const STORAGE_KEY = "studyroom-scene-preferences-v3";
const sceneKeys: SceneKey[] = ["mountain", "beach", "forest", "library", "cafe", "snow"];
const timeKeys: SceneTimeKey[] = ["morning", "forenoon", "noon", "afternoon", "dusk", "night", "midnight"];
const timeModes: SceneTimeMode[] = ["manual", "smart", "always"];

export function defaultScenePreferences(now = new Date()): ScenePreferences {
  return { version: 3, sceneKey: "mountain", timeKey: timeFromSystem(now), timeMode: "manual" };
}

export function sanitizeScenePreferences(value: unknown, now = new Date()): ScenePreferences {
  const defaults = defaultScenePreferences(now);
  if (!value || typeof value !== "object") return defaults;
  const candidate = value as Partial<ScenePreferences>;
  if (candidate.version !== 3 || !sceneKeys.includes(candidate.sceneKey as SceneKey) || !timeKeys.includes(candidate.timeKey as SceneTimeKey) || !timeModes.includes(candidate.timeMode as SceneTimeMode)) return defaults;
  return { version: 3, sceneKey: candidate.sceneKey as SceneKey, timeKey: candidate.timeKey as SceneTimeKey, timeMode: candidate.timeMode as SceneTimeMode };
}

export const useSceneStore = defineStore("scene", {
  state: () => ({
    ...defaultScenePreferences(),
    focusSnapshot: null as FocusSceneSnapshot | null,
    lowPerformance: false,
    viewportWidth: 1280,
    clockHandle: 0
  }),
  getters: {
    preferredSize(state): Exclude<SceneSizeKey, "thumb"> {
      return selectSceneSize(state.viewportWidth, state.lowPerformance);
    }
  },
  actions: {
    persist() {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, sceneKey: this.sceneKey, timeKey: this.timeKey, timeMode: this.timeMode }));
    },
    replacePreferences(value: unknown, now = new Date()) {
      const preferences = sanitizeScenePreferences(value, now);
      this.sceneKey = preferences.sceneKey;
      this.timeKey = preferences.timeKey;
      this.timeMode = preferences.timeMode;
    },
    hydrate(now = new Date()) {
      if (typeof localStorage === "undefined") return;
      try {
        this.replacePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"), now);
      } catch {
        this.replacePreferences(null, now);
      }
      this.persist();
    },
    setScene(sceneKey: SceneKey) {
      this.sceneKey = sceneKey;
      if (this.focusSnapshot) this.focusSnapshot.sceneKey = sceneKey;
      this.persist();
    },
    setTime(timeKey: SceneTimeKey) {
      this.timeKey = timeKey;
      if (this.focusSnapshot) this.focusSnapshot.timeKey = timeKey;
      this.persist();
    },
    setMode(timeMode: SceneTimeMode, now = new Date()) {
      this.timeMode = timeMode;
      if (timeMode !== "manual") this.syncSystemTime(now);
      this.persist();
    },
    cycleMode(now = new Date()) {
      const index = timeModes.indexOf(this.timeMode);
      this.setMode(timeModes[(index + 1) % timeModes.length], now);
    },
    syncSystemTime(now = new Date()) {
      if (this.timeMode === "manual" || (this.timeMode === "smart" && this.focusSnapshot)) return;
      this.timeKey = timeFromSystem(now);
      if (this.focusSnapshot && this.timeMode === "always") this.focusSnapshot.timeKey = this.timeKey;
      this.persist();
    },
    beginFocusSession(sessionId: string | number) {
      this.focusSnapshot = { sessionId: String(sessionId), sceneKey: this.sceneKey, timeKey: this.timeKey };
    },
    restoreFocusSession(value: unknown) {
      if (!value || typeof value !== "object") return false;
      const candidate = value as Partial<FocusSceneSnapshot>;
      const sessionId = String(candidate.sessionId ?? "").trim();
      if (!sessionId || !sceneKeys.includes(candidate.sceneKey as SceneKey) || !timeKeys.includes(candidate.timeKey as SceneTimeKey)) return false;
      this.sceneKey = candidate.sceneKey as SceneKey;
      this.timeKey = candidate.timeKey as SceneTimeKey;
      this.focusSnapshot = { sessionId, sceneKey: this.sceneKey, timeKey: this.timeKey };
      this.persist();
      return true;
    },
    endFocusSession(now = new Date()) {
      this.focusSnapshot = null;
      if (this.timeMode === "smart") this.syncSystemTime(now);
    },
    updateRuntime({ viewportWidth, lowPerformance }: { viewportWidth?: number; lowPerformance?: boolean }) {
      if (Number.isFinite(viewportWidth) && Number(viewportWidth) > 0) this.viewportWidth = Number(viewportWidth);
      if (typeof lowPerformance === "boolean") this.lowPerformance = lowPerformance;
    },
    startClock() {
      if (typeof window === "undefined" || this.clockHandle) return;
      this.viewportWidth = window.innerWidth;
      this.clockHandle = window.setInterval(() => this.syncSystemTime(), 30_000) as unknown as number;
    },
    disposeClock() {
      if (typeof window !== "undefined" && this.clockHandle) window.clearInterval(this.clockHandle);
      this.clockHandle = 0;
    }
  }
});
