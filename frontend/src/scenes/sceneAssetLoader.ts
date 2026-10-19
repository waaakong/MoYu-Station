import type { SceneFormatUrls, SceneSizeKey } from "./sceneAssetCatalog";

export type ImageLoad = (url: string) => Promise<void>;

export interface SceneIdlePrefetcher {
  schedule: (assets: SceneFormatUrls[]) => void;
  cancel: () => void;
  dispose: () => void;
}

interface SceneIdlePrefetcherOptions {
  load?: ImageLoad;
  maxConcurrency?: number;
  scheduleIdle?: (callback: () => void) => number;
  cancelIdle?: (handle: number) => void;
}

export function selectSceneSize(viewportWidth: number, lowPerformance: boolean): Exclude<SceneSizeKey, "thumb"> {
  return lowPerformance || viewportWidth <= 1366 ? "standard" : "large";
}

export async function browserImageLoad(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
        resolve();
      } catch {
        reject(new Error(`Unable to decode scene image: ${url}`));
      }
    };
    image.onerror = () => reject(new Error(`Unable to load scene image: ${url}`));
    image.src = url;
  });
}

export async function loadSceneAsset(urls: SceneFormatUrls, load: ImageLoad = browserImageLoad): Promise<string> {
  try {
    await load(urls.webp);
    return urls.webp;
  } catch {
    await load(urls.jpg);
    return urls.jpg;
  }
}

function defaultScheduleIdle(callback: () => void): number {
  if (typeof window.requestIdleCallback === "function") {
    return window.requestIdleCallback(callback, { timeout: 1200 });
  }
  return window.setTimeout(callback, 240);
}

function defaultCancelIdle(handle: number): void {
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(handle);
  else window.clearTimeout(handle);
}

export function createSceneIdlePrefetcher(options: SceneIdlePrefetcherOptions = {}): SceneIdlePrefetcher {
  const load = options.load || browserImageLoad;
  const maxConcurrency = Math.max(1, Math.min(2, options.maxConcurrency || 2));
  const scheduleIdle = options.scheduleIdle || defaultScheduleIdle;
  const cancelIdle = options.cancelIdle || defaultCancelIdle;
  let generation = 0;
  let idleHandle: number | null = null;
  let disposed = false;
  let active = 0;
  let queue: Array<{ generation: number; assets: SceneFormatUrls }> = [];

  const pump = () => {
    if (disposed) return;
    while (active < maxConcurrency && queue.length > 0) {
      const item = queue.shift();
      if (!item || item.generation !== generation) continue;
      active += 1;
      void loadSceneAsset(item.assets, load)
        .catch(() => undefined)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  const cancel = () => {
    generation += 1;
    queue = [];
    if (idleHandle !== null) {
      cancelIdle(idleHandle);
      idleHandle = null;
    }
  };

  return {
    schedule(assets) {
      cancel();
      if (disposed || assets.length === 0) return;
      const scheduledGeneration = generation;
      idleHandle = scheduleIdle(() => {
        idleHandle = null;
        if (disposed || scheduledGeneration !== generation) return;
        queue = assets.map((entry) => ({ generation: scheduledGeneration, assets: entry }));
        pump();
      });
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
    }
  };
}
