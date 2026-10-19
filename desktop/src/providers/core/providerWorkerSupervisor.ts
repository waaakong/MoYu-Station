import { randomUUID } from "node:crypto";
import type { ProviderId } from "@studyroom/contracts";
import { parseWorkerResponse, type ProviderWorkerMessage, type ProviderWorkerRequest } from "./providerWorkerProtocol";
import { ProviderError } from "./providerErrors";

export interface ProviderWorkerProcess {
  postMessage(message: ProviderWorkerMessage): void;
  on(event: "message", listener: (message: unknown) => void): this;
  on(event: "exit", listener: (code: number) => void): this;
  kill(): void;
}

export type ProviderWorkerLauncher = (providerId: ProviderId) => ProviderWorkerProcess;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}

export class ProviderWorkerSupervisor {
  private process?: ProviderWorkerProcess;
  private readonly pending = new Map<string, PendingRequest>();
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(
    readonly providerId: ProviderId,
    private readonly launcher: ProviderWorkerLauncher,
    private readonly requestTimeoutMs = 10_000,
    private readonly idleTimeoutMs = 5 * 60_000
  ) {}

  async request<T>(operation: ProviderWorkerRequest["operation"], payload?: unknown, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const worker = this.ensureWorker();
    this.clearIdleTimer();
    const requestId = randomUUID();
    try {
      return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        signal?.removeEventListener("abort", abort);
        this.cancelRequest(worker, requestId);
        reject(new ProviderError("PROVIDER_TIMEOUT", "PROVIDER_TIMEOUT", true));
      }, this.requestTimeoutMs);
      const abort = () => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(requestId);
        signal?.removeEventListener("abort", abort);
        this.cancelRequest(worker, requestId);
        reject(new DOMException("Aborted", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.pending.set(requestId, {
        resolve: (value) => { signal?.removeEventListener("abort", abort); resolve(value as T); },
        reject: (error) => { signal?.removeEventListener("abort", abort); reject(error); },
        timer
      });
      try {
        worker.postMessage({ requestId, providerId: this.providerId, operation, payload });
      } catch (error) {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        this.pending.delete(requestId);
        reject(error);
      }
      });
    } finally {
      if (this.process && this.pending.size === 0) this.armIdleTimer();
    }
  }

  dispose(): void {
    this.clearIdleTimer();
    const worker = this.process;
    this.process = undefined;
    worker?.kill();
    this.rejectAll(new ProviderError("PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE", true));
  }

  private ensureWorker(): ProviderWorkerProcess {
    if (this.process) return this.process;
    const worker = this.launcher(this.providerId);
    worker.on("message", (message) => {
      if (this.process === worker) this.handleMessage(message);
    });
    worker.on("exit", () => {
      if (this.process !== worker) return;
      this.process = undefined;
      this.rejectAll(new ProviderError("PROVIDER_UNAVAILABLE", "PROVIDER_UNAVAILABLE", true));
    });
    this.process = worker;
    return worker;
  }

  private handleMessage(message: unknown): void {
    const response = parseWorkerResponse(message);
    if (!response) return;
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.value);
    else {
      const code=response.errorCode??"PROVIDER_UNAVAILABLE";
      pending.reject(new ProviderError(code,code,["PROVIDER_TIMEOUT","PROVIDER_RATE_LIMITED","PROVIDER_UNAVAILABLE"].includes(code),code==='PROVIDER_RATE_LIMITED'?response.retryAfterMs:undefined));
    }
  }

  private rejectAll(error: ProviderError): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private cancelRequest(worker: ProviderWorkerProcess, requestId: string): void {
    if (this.process !== worker) return;
    try {
      worker.postMessage({ operation: "cancel", providerId: this.providerId, requestId });
    } catch {
      // If cancellation cannot be delivered, kill this worker so network work cannot linger.
      this.dispose();
    }
  }

  private armIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.dispose(), this.idleTimeoutMs);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}
