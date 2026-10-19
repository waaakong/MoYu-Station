import type { ProviderId } from "@studyroom/contracts";
import { normalizeProviderError } from "./providerErrors";
import {
  parseWorkerRequest, parseWorkerResponse, providerWorkerCancelSchema,
  type ProviderWorkerRequest, type ProviderWorkerResponse
} from "./providerWorkerProtocol";

export type ProviderWorkerExecutor = (request: ProviderWorkerRequest, signal: AbortSignal) => Promise<unknown>;

/** A utility-process boundary. Adapters must pass this signal to every network call. */
export class ProviderWorkerRuntime {
  private providerId?: ProviderId;
  private readonly active = new Map<string, AbortController>();
  private disposed = false;

  constructor(
    private readonly execute: ProviderWorkerExecutor,
    private readonly reply: (response: ProviderWorkerResponse) => void,
    private readonly exit: () => void,
    private readonly maxActive = 3
  ) {}

  async receive(input: unknown): Promise<void> {
    if (this.disposed) return;
    const cancel = providerWorkerCancelSchema.safeParse(input);
    if (cancel.success) {
      if (cancel.data.providerId === this.providerId) this.active.get(cancel.data.requestId)?.abort();
      return;
    }
    const request = parseWorkerRequest(input);
    if (!request) return;
    this.providerId ??= request.providerId;
    if (request.providerId !== this.providerId) {
      this.reply({ requestId: request.requestId, ok: false, errorCode: "PROVIDER_UNAVAILABLE" });
      return;
    }
    if (request.operation === "dispose") {
      this.dispose();
      this.reply({ requestId: request.requestId, ok: true });
      this.exit();
      return;
    }
    // A duplicate must not settle or cancel the original request.
    if (this.active.has(request.requestId)) return;
    if (request.operation === "ping") {
      this.reply({ requestId: request.requestId, ok: true, value: { ready: true } });
      return;
    }
    if (this.active.size >= this.maxActive) {
      this.reply({ requestId: request.requestId, ok: false, errorCode: "PROVIDER_RATE_LIMITED" });
      return;
    }
    const controller = new AbortController();
    this.active.set(request.requestId, controller);
    try {
      const value = await this.execute(request, controller.signal);
      if (controller.signal.aborted || this.disposed) return;
      const response = parseWorkerResponse({ requestId: request.requestId, ok: true, value });
      this.reply(response ?? { requestId: request.requestId, ok: false, errorCode: "PROVIDER_API_CHANGED" });
    } catch (error) {
      if (controller.signal.aborted || this.disposed) return;
      const normalized=normalizeProviderError(error);
      const retryAfterMs=normalized.code==='PROVIDER_RATE_LIMITED'&&Number.isInteger(normalized.retryAfterMs)&&normalized.retryAfterMs!>=1000&&normalized.retryAfterMs!<=7*86400_000?normalized.retryAfterMs:undefined;
      this.reply({ requestId: request.requestId, ok: false, errorCode: normalized.code,...(retryAfterMs!==undefined?{retryAfterMs}:{}) });
    } finally {
      this.active.delete(request.requestId);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }
}
