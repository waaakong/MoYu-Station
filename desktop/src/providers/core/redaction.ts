const PRIVATE_KEYS = /authorization|cookie|token|secret|password|account|url|headers|body|query/i;
const URL_PATTERN = /https?:\/\/[^\s]+/gi;

export interface ProviderLogEvent {
  providerId: string;
  operation: string;
  durationMs: number;
  errorCode?: string;
  correlationId: string;
}

export function redactText(value: string): string {
  return value.replace(URL_PATTERN, "[redacted-url]").slice(0, 500);
}

export function safeProviderLog(input: Record<string, unknown>): ProviderLogEvent {
  for (const key of Object.keys(input)) {
    if (PRIVATE_KEYS.test(key)) throw new Error("UNSAFE_PROVIDER_LOG_FIELD");
  }
  return {
    providerId: String(input.providerId ?? "unknown").slice(0, 20),
    operation: String(input.operation ?? "unknown").slice(0, 60),
    durationMs: Math.max(0, Math.round(Number(input.durationMs) || 0)),
    errorCode: input.errorCode == null ? undefined : String(input.errorCode).slice(0, 80),
    correlationId: String(input.correlationId ?? "unknown").slice(0, 80)
  };
}
