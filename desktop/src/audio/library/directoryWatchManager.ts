import { watch } from "node:fs";
import { resolve, sep } from "node:path";

export interface WatchedDirectory {
  id: string;
  localPath: string;
}

interface ActiveWatch {
  watcher: WatchHandle;
  timer?: NodeJS.Timeout;
}

interface WatchHandle {
  close(): void;
  on(event: "error", listener: () => void): unknown;
}

type WatchListener = (eventType: string, filename: string | Buffer | null) => void;
type WatchFactory = (path: string, listener: WatchListener) => WatchHandle;

export class DirectoryWatchManager {
  private readonly active = new Map<string, ActiveWatch>();

  constructor(
    private readonly onChange: (root: WatchedDirectory) => Promise<void>,
    private readonly onAttention: (rootId: string) => void,
    private readonly debounceMs = 1_500,
    private readonly watchDirectory: WatchFactory = (path, listener) => watch(path, { recursive: true }, listener)
  ) {}

  start(root: WatchedDirectory): boolean {
    this.stop(root.id);
    try {
      const rootPath = resolve(root.localPath);
      const watcher = this.watchDirectory(rootPath, (_eventType, filename) => {
        if (!filename) {
          this.fail(root.id);
          return;
        }
        const changedPath = resolve(rootPath, filename.toString());
        const prefix = `${rootPath}${sep}`.toLocaleLowerCase();
        if (changedPath.toLocaleLowerCase() !== rootPath.toLocaleLowerCase() && !changedPath.toLocaleLowerCase().startsWith(prefix)) return;
        const active = this.active.get(root.id);
        if (!active) return;
        if (active.timer) clearTimeout(active.timer);
        active.timer = setTimeout(() => {
          active.timer = undefined;
          void this.onChange(root).catch(() => this.fail(root.id));
        }, this.debounceMs);
      });
      watcher.on("error", () => this.fail(root.id));
      this.active.set(root.id, { watcher });
      return true;
    } catch {
      this.onAttention(root.id);
      return false;
    }
  }

  stop(rootId: string): void {
    const active = this.active.get(rootId);
    if (!active) return;
    if (active.timer) clearTimeout(active.timer);
    active.watcher.close();
    this.active.delete(rootId);
  }

  stopAll(): void {
    for (const rootId of [...this.active.keys()]) this.stop(rootId);
  }

  isWatching(rootId: string): boolean {
    return this.active.has(rootId);
  }

  private fail(rootId: string): void {
    this.stop(rootId);
    this.onAttention(rootId);
  }
}
