import { ImageUploadQueue, type ImageUploadDependencies, type UploadScope } from "./imageUploadQueue";
import { MediaApi, type Published } from "./mediaApi";
import { MediaPublicationTask } from "./mediaPublicationTask";

/** One immutable target per draft. No page state is read after the user submits. */
export class MediaDraft {
  readonly queue: ImageUploadQueue;
  private tasks: MediaPublicationTask[] = [];
  private state: "editing" | "sending" | "unknown" | "rejected" | "complete" | "disposed" = "editing";
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  private running?: Promise<Published[]>;
  private target: UploadScope["target"];
  constructor(private api: MediaApi, scope: UploadScope, deps: ImageUploadDependencies) {
    this.target = Object.freeze({ ...scope.target });
    this.queue = new ImageUploadQueue(scope, deps); this.unsubscribe = this.queue.subscribe(() => this.notify());
  }
  snapshot() { return { items: this.queue.snapshot(), state: this.state, locked: this.state !== "editing",
    completed: this.tasks.filter(task => task.snapshot().status === "committed").length, total: this.tasks.length }; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  add(files: readonly File[]) { this.editable(); this.queue.add(files); }
  remove(id: string) { this.editable(); this.queue.remove(id); }
  retry(id: string) { this.editable(); this.queue.retry(id); }
  cancel(id: string) { this.editable(); this.queue.cancel(id); }
  reorder(ids: readonly string[]) { this.editable(); this.queue.reorder(ids); }
  submit(content: string, scene: string | null): Promise<Published[]> {
    if (this.running) return this.running;
    if (["disposed", "complete", "rejected"].includes(this.state)) return Promise.reject(new Error("任务已结束，请清除本地草稿后重新添加。"));
    try {
      if (!this.tasks.length) {
        const assets = this.queue.assetsForPublish();
        if (!assets.length) throw new Error("请先添加图片。");
        const kind = this.target.kind === "feed" ? "POST" : this.target.kind === "hall" ? "HALL" : "PRIVATE";
        const recipient = this.target.kind === "private" ? this.target.recipientId : null;
        this.tasks = (kind === "POST" ? [assets] : assets.map(id => [id])).map((ids, index) => new MediaPublicationTask(this.api, {
          requestId: crypto.randomUUID(), kind, recipient, content: index === 0 ? content : "", scene: kind === "POST" ? scene : null, assets: ids
        }));
      }
    } catch (error) { return Promise.reject(error); }
    this.state = "sending"; this.notify();
    this.running = (async () => {
      const results: Published[] = [];
      try {
        for (const task of this.tasks) { results.push(await task.submit()); if (this.state === "disposed") throw new DOMException("Cancelled", "AbortError"); this.notify(); }
        this.state = "complete"; return results;
      } catch (error) {
        if (this.state !== "disposed") this.state = this.tasks.some(task => task.snapshot().status === "rejected") ? "rejected" : "unknown";
        throw error;
      } finally { this.running = undefined; this.notify(); }
    })();
    return this.running;
  }
  dispose() {
    this.state = "disposed"; this.tasks.forEach(task => task.cancel()); this.queue.dispose(); this.unsubscribe(); this.notify(); this.listeners.clear();
  }
  private editable() { if (this.state !== "editing") throw new Error("请先确认原发布结果，当前任务不能修改。"); }
  private notify() { this.listeners.forEach(listener => listener()); }
}
