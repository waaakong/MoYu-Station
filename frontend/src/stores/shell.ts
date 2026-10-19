import { defineStore } from "pinia";

export type DrawerId = "appearance" | null;
export type ToastTone = "info" | "success" | "error";

interface ShellPreferences {
  compact: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  lowPerformance: boolean;
  startupAnimation: boolean;
}

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

const STORAGE_KEY = "studyroom-shell-preferences-v2";

function defaultPreferences(): ShellPreferences {
  return {
    compact: false,
    reducedMotion: false,
    reducedTransparency: false,
    lowPerformance: false,
    startupAnimation: true
  };
}

function readPreferences(): ShellPreferences {
  const defaults = defaultPreferences();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<ShellPreferences>;
    return {
      compact: Boolean(saved.compact),
      reducedMotion: saved.reducedMotion ?? defaults.reducedMotion,
      reducedTransparency: Boolean(saved.reducedTransparency),
      lowPerformance: Boolean(saved.lowPerformance),
      startupAnimation: saved.startupAnimation !== false
    };
  } catch {
    return defaults;
  }
}

export const useShellStore = defineStore("shell", {
  state: () => ({
    drawer: null as DrawerId,
    immersive: false,
    bossMode: false,
    preferences: readPreferences(),
    systemReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    systemReducedTransparency: window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches ?? false,
    toasts: [] as ToastMessage[],
    nextToastId: 1
  }),
  getters: {
    motionReduced: state => state.preferences.reducedMotion || state.preferences.lowPerformance || state.systemReducedMotion,
    transparencyReduced: state => state.preferences.reducedTransparency || state.preferences.lowPerformance || state.systemReducedTransparency
  },
  actions: {
    openDrawer(drawer: Exclude<DrawerId, null>) {
      this.drawer = drawer;
    },
    closeDrawer() {
      this.drawer = null;
    },
    setImmersive(active: boolean) {
      this.immersive = active;
    },
    setBossMode(active: boolean) {
      this.bossMode = active;
    },
    toggleBossMode() {
      this.bossMode = !this.bossMode;
    },
    updatePreference<K extends keyof ShellPreferences>(key: K, value: ShellPreferences[K]) {
      const next = { ...this.preferences, [key]: value };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      this.preferences = next;
    },
    toast(message: string, tone: ToastTone = "info") {
      const id = this.nextToastId++;
      this.toasts.push({ id, message, tone });
      window.setTimeout(() => this.dismissToast(id), 3600);
    },
    dismissToast(id: number) {
      this.toasts = this.toasts.filter((item) => item.id !== id);
    }
  }
});
