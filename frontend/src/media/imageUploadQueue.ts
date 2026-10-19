import { validateImageCandidate } from "../utils/imagePipeline";
import { CandidateError } from "./candidateContainer";

export type UploadTarget = { kind: "feed" | "hall" } | { kind: "private"; recipientId: string };
export type UploadScope = { accountId: string; target: UploadTarget };
export type UploadStatus = "queued" | "processing" | "uploading" | "ready" | "failed" | "cancelled";
export type UploadPhase = "prepare" | "upload" | "lookup";
export type AssetReceipt = { id: string; expiresAt: number | null };
export type UploadLookup = { status: "ready"; asset: AssetReceipt } | { status: "pending" | "missing" | "expired" | "bound" }
  | { status: "failed"; retryable: boolean; code: string };
export type UploadJob = Readonly<{ attachmentId: string; requestId: string; scope: Readonly<UploadScope>; signal: AbortSignal }>;
export type UploadItem = Readonly<{
  id: string; requestId: string; name: string; previewUrl: string;
  status: UploadStatus; phase: UploadPhase; asset?: Readonly<AssetReceipt>;
  detail?: string;
  error?: "PROCESSING_FAILED" | "UPLOAD_REJECTED" | "OUTCOME_UNKNOWN" | "ASSET_EXPIRED" | "ASSET_BOUND" | "UPLOAD_TERMINAL";
}>;

/** Only a definitive server rejection permits retry without a lookup. */
export class UploadRejectedError extends Error {}
export class UploadTerminalError extends Error {
  constructor(readonly reason: "ASSET_EXPIRED" | "ASSET_BOUND" | "UPLOAD_TERMINAL") { super(reason); }
}

class WorkLimit {
  private active = 0;
  private waiting: Array<() => void> = [];
  constructor(private readonly limit: number) {}
  run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const cancel = () => {
        this.waiting = this.waiting.filter(item => item !== start);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      const start = () => {
        signal.removeEventListener("abort", cancel);
        if (signal.aborted) { cancel(); return; }
        this.active++;
        void Promise.resolve().then(work).then(resolve, reject).finally(() => {
          this.active--;
          this.drain();
        });
      };
      if (signal.aborted) { cancel(); return; }
      signal.addEventListener("abort", cancel, { once: true });
      this.waiting.push(start);
      this.drain();
    });
  }
  private drain() {
    while (this.active < this.limit && this.waiting.length) this.waiting.shift()!();
  }
}

export function createImageUploadScheduler(networkConcurrency: 1 | 2 = 2) {
  return { prepare: new WorkLimit(1), network: new WorkLimit(networkConcurrency) };
}
// Shared by all composer queues in a renderer, including separate recipients.
// The qualified server decoder has one admission slot. Serial UI uploads avoid
// turning an ordinary multi-image selection into deterministic MEDIA_BUSY errors.
const sharedScheduler = createImageUploadScheduler(1);

export interface ImageUploadDependencies {
  prepare(file: File, job: UploadJob): Promise<File>;
  upload(file: File, job: UploadJob): Promise<AssetReceipt>;
  lookup(job: UploadJob): Promise<UploadLookup>;
  createPreview?: (file: File) => string;
  /** UI callers preview only the qualified candidate, never source blobs. */
  previewAfterPrepare?: boolean;
  revokePreview?: (url: string) => void;
  createId?: () => string;
  now?: () => number;
  scheduler?: ReturnType<typeof createImageUploadScheduler>;
}
type Entry = {
  view: UploadItem;
  file: File;
  prepared?: File;
  job: UploadJob;
  controller: AbortController;
  running: boolean;
};

/** A headless queue: no publish, persistence, HTTP calls or automatic retries. */
export class ImageUploadQueue {
  private entries: Entry[] = [];
  private scope: Readonly<UploadScope>;
  private disposed = false;
  private listeners = new Set<() => void>();
  private readonly scheduler;
  private readonly createId;
  private readonly createPreview;
  private readonly revokePreview;
  private readonly now;

  constructor(scope: UploadScope, private readonly deps: ImageUploadDependencies) {
    this.scope = this.freezeScope(scope);
    this.scheduler = deps.scheduler ?? sharedScheduler;
    this.createId = deps.createId ?? (() => crypto.randomUUID());
    this.createPreview = deps.createPreview ?? (file => URL.createObjectURL(file));
    this.revokePreview = deps.revokePreview ?? (url => URL.revokeObjectURL(url));
    this.now = deps.now ?? Date.now;
  }

  snapshot(): UploadItem[] {
    return this.entries.map(({ view }) => ({ ...view, asset: view.asset && { ...view.asset } }));
  }
  subscribe(listener: () => void): () => void {
    this.assertOpen();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  add(files: readonly File[]): string[] {
    this.assertOpen();
    if (files.length + this.entries.length > 9) throw new Error("最多选择 9 张图片，请调整后重新选择；本批未添加。");
    files.forEach(validateImageCandidate);
    const batch: Entry[] = [];
    try {
      for (const file of files) {
        const id = this.createId(), requestId = this.createId();
        const controller = new AbortController();
        batch.push({
          file, controller, running: false,
          job: Object.freeze({ attachmentId: id, requestId, scope: this.scope, signal: controller.signal }),
          view: { id, requestId, name: file.name, previewUrl: this.deps.previewAfterPrepare ? "" : this.createPreview(file), status: "queued", phase: "prepare" }
        });
      }
    } catch (error) {
      batch.forEach(entry => this.releasePreview(entry));
      throw error;
    }
    this.entries.push(...batch);
    this.notify();
    batch.forEach(entry => { void this.execute(entry); });
    return batch.map(entry => entry.view.id);
  }

  cancel(id: string) {
    const entry = this.find(id);
    if (!entry) return;
    entry.controller.abort();
    entry.prepared = undefined;
    this.releasePreview(entry);
    this.update(entry, { status: "cancelled", asset: undefined, error: undefined });
  }
  remove(id: string) {
    const entry = this.find(id);
    if (!entry) return;
    this.entries = this.entries.filter(item => item !== entry);
    entry.controller.abort();
    entry.prepared = undefined;
    this.releasePreview(entry);
    this.notify();
  }
  reorder(ids: readonly string[]) {
    this.assertOpen();
    const byId = new Map(this.entries.map(entry => [entry.view.id, entry]));
    if (ids.length !== byId.size || new Set(ids).size !== ids.length || ids.some(id => !byId.has(id))) {
      throw new Error("附件顺序无效。");
    }
    this.entries = ids.map(id => byId.get(id)!);
    this.notify();
  }
  retry(id: string) {
    const entry = this.find(id);
    if (!entry || entry.running || entry.view.status !== "failed" || ["ASSET_EXPIRED", "ASSET_BOUND", "UPLOAD_TERMINAL"].includes(entry.view.error || "")) return;
    this.update(entry, { status: "queued" });
    void this.execute(entry);
  }
  reset(scope: UploadScope) {
    this.assertOpen();
    const nextScope = this.freezeScope(scope);
    this.clear();
    this.scope = nextScope;
    this.notify();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.notify();
    this.listeners.clear();
  }
  assetsForPublish(): string[] {
    this.assertOpen();
    return this.entries.map(entry => {
      if (entry.view.status !== "ready" || !entry.view.asset) throw new Error("请先完成全部图片上传，或移除未就绪图片。");
      if (this.expired(entry.view.asset)) {
        this.update(entry, { status: "failed", error: "ASSET_EXPIRED", asset: undefined });
        throw new Error("图片已过期，请移除后重新添加。");
      }
      return entry.view.asset.id;
    });
  }

  private async execute(entry: Entry) {
    if (!this.live(entry) || entry.running) return;
    entry.running = true;
    try {
      if (!entry.prepared) {
        const prepared = await this.scheduler.prepare.run(entry.job.signal, async () => {
          if (!this.live(entry)) throw new DOMException("Cancelled", "AbortError");
          this.update(entry, { status: "processing", phase: "prepare", error: undefined, detail: undefined });
          if (!this.live(entry)) throw new DOMException("Cancelled", "AbortError");
          return this.deps.prepare(entry.file, entry.job);
        });
        if (!this.live(entry)) return;
        entry.prepared = prepared;
        if (this.deps.previewAfterPrepare) this.update(entry, { previewUrl: this.createPreview(prepared) });
      }
      const needsLookup = entry.view.error === "OUTCOME_UNKNOWN";
      this.update(entry, { status: "queued", phase: needsLookup ? "lookup" : "upload" });
      await this.scheduler.network.run(entry.job.signal, async () => {
        if (!this.live(entry)) return;
        this.update(entry, { status: "uploading", error: undefined });
        if (!this.live(entry)) return;
        if (needsLookup) {
          const result = await this.deps.lookup(entry.job);
          if (!this.live(entry)) return;
          if (result.status === "ready") { this.accept(entry, result.asset); return; }
          if (result.status === "pending") { this.update(entry, { status: "failed", error: "OUTCOME_UNKNOWN" }); return; }
          if (result.status === "expired") throw new UploadTerminalError("ASSET_EXPIRED");
          if (result.status === "bound") throw new UploadTerminalError("ASSET_BOUND");
          if (result.status === "failed" && !result.retryable) throw new UploadTerminalError("UPLOAD_TERMINAL");
          // Only an authoritative missing outcome permits another upload.
          if (result.status !== "missing" && !(result.status === "failed" && result.retryable)) throw new Error("Invalid lookup response");
        }
        this.update(entry, { phase: "upload" });
        if (!this.live(entry)) return;
        const asset = await this.deps.upload(entry.prepared!, entry.job);
        if (this.live(entry)) this.accept(entry, asset);
      });
    } catch (error) {
      if (this.live(entry)) this.update(entry, {
        status: "failed",
        detail: error instanceof CandidateError ? error.message : undefined,
        error: error instanceof UploadTerminalError ? error.reason : entry.view.phase === "prepare" ? "PROCESSING_FAILED"
          : entry.view.phase === "upload" && error instanceof UploadRejectedError ? "UPLOAD_REJECTED" : "OUTCOME_UNKNOWN"
      });
    } finally { entry.running = false; }
  }
  private accept(entry: Entry, asset: AssetReceipt) {
    if (!asset || typeof asset.id !== "string" || !asset.id.trim() || (asset.expiresAt !== null && !Number.isFinite(asset.expiresAt))) throw new Error("Invalid asset receipt");
    if (this.expired(asset)) {
      this.update(entry, { status: "failed", error: "ASSET_EXPIRED", asset: undefined });
    } else this.update(entry, { status: "ready", error: undefined, asset: Object.freeze({ ...asset }) });
  }
  private expired(asset: AssetReceipt) { return asset.expiresAt !== null && asset.expiresAt <= this.now(); }
  private find(id: string) { return this.entries.find(entry => entry.view.id === id); }
  private live(entry: Entry) { return !this.disposed && !entry.controller.signal.aborted && this.entries.includes(entry); }
  private update(entry: Entry, patch: Partial<UploadItem>) { entry.view = { ...entry.view, ...patch }; this.notify(); }
  private releasePreview(entry: Entry) {
    if (entry.view.previewUrl) this.revokePreview(entry.view.previewUrl);
    entry.view = { ...entry.view, previewUrl: "" };
  }
  private clear() {
    const old = this.entries;
    this.entries = [];
    old.forEach(entry => { entry.controller.abort(); entry.prepared = undefined; this.releasePreview(entry); });
  }
  private freezeScope(scope: UploadScope): Readonly<UploadScope> {
    if (!scope.accountId || (scope.target.kind === "private" && !scope.target.recipientId)) throw new Error("上传账号或收件人无效。");
    return Object.freeze({ accountId: scope.accountId, target: Object.freeze({ ...scope.target }) });
  }
  private assertOpen() { if (this.disposed) throw new Error("上传队列已关闭。"); }
  private notify() {
    for (const listener of this.listeners) {
      try { listener(); } catch { console.error("Image upload queue listener failed"); }
    }
  }
}
