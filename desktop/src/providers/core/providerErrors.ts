import type { ProviderErrorCode } from "@studyroom/contracts";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string = code,
    readonly retryable = false,
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ProviderError("PROVIDER_UNAVAILABLE", "Provider request canceled", false);
  }
  return new ProviderError("PROVIDER_UNAVAILABLE", "Provider operation failed", true);
}

export function isCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
