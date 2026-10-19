import { z } from "zod";
import { PROVIDER_IDS } from "@studyroom/contracts";

export const WORKER_OPERATIONS = [
  "ping", "dispose", "account", "search", "searchPage", "trackDetails", "recommendations", "playlists", "favorites", "playlistTracks", "lyrics", "resolvePlayback"
] as const;

export const providerWorkerRequestSchema = z.object({
  requestId: z.string().uuid(),
  providerId: z.enum(PROVIDER_IDS),
  operation: z.enum(WORKER_OPERATIONS),
  payload: z.unknown().optional()
}).strict().superRefine((request, context) => {
  if (Buffer.byteLength(JSON.stringify(request.payload ?? null), "utf8") > 64 * 1024) {
    context.addIssue({ code: "custom", message: "PROVIDER_WORKER_PAYLOAD_TOO_LARGE" });
  }
});

export const providerWorkerResponseSchema = z.object({
  requestId: z.string().uuid(),
  ok: z.boolean(),
  value: z.unknown().optional(),
  errorCode: z.enum([
    "PROVIDER_APP_LOGIN_REQUIRED", "PROVIDER_DISABLED", "PROVIDER_LOGIN_REQUIRED", "PROVIDER_SESSION_EXPIRED", "PROVIDER_TIMEOUT",
    "PROVIDER_RATE_LIMITED", "PROVIDER_CIRCUIT_OPEN", "PROVIDER_RIGHTS_RESTRICTED",
    "PROVIDER_REGION_RESTRICTED", "PROVIDER_API_CHANGED", "PROVIDER_UNAVAILABLE"
  ]).optional(),
  retryAfterMs:z.number().int().min(1000).max(7*86400_000).optional()
}).strict();

export type ProviderWorkerRequest = z.infer<typeof providerWorkerRequestSchema>;
export type ProviderWorkerResponse = z.infer<typeof providerWorkerResponseSchema>;

// Control messages never carry credentials or a general-purpose operation payload.
export const providerWorkerCancelSchema = z.object({
  operation: z.literal("cancel"),
  providerId: z.enum(PROVIDER_IDS),
  requestId: z.string().uuid()
}).strict();
export type ProviderWorkerMessage = ProviderWorkerRequest | z.infer<typeof providerWorkerCancelSchema>;

export function parseWorkerRequest(input: unknown): ProviderWorkerRequest | undefined {
  try {
    const parsed = providerWorkerRequestSchema.safeParse(input);
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Cycles, BigInt and hostile serialization must not crash the utility process.
    return undefined;
  }
}

export function parseWorkerResponse(input: unknown): ProviderWorkerResponse | undefined {
  try {
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > 1024 * 1024) return undefined;
    const parsed = providerWorkerResponseSchema.safeParse(input);
    return parsed.success ? parsed.data : undefined;
  } catch { return undefined; }
}
