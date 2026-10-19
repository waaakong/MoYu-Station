import { z } from "zod";
import type { UpdateChannel } from "@studyroom/contracts";

const checkDataSchema = z.object({
  status: z.enum(["disabled", "unauthorized", "not-available", "available", "required"]),
  message: z.string().max(500),
  currentVersion: z.string().min(1).max(64),
  availableVersion: z.string().min(1).max(64).nullable().optional(),
  channel: z.enum(["stable", "beta", "provider-experimental"]),
  mandatory: z.boolean(),
  releaseNotes: z.string().max(4000).nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  feedUrl: z.string().url().nullable().optional(),
  accessToken: z.string().min(32).max(256).nullable().optional(),
  accessTokenExpiresAt: z.string().nullable().optional(),
  manifestJson: z.string().max(20_000).nullable().optional(),
  manifestSignature: z.string().max(1000).nullable().optional(),
  manifestKeyId: z.string().max(64).nullable().optional()
}).strict();

const responseSchema = z.object({
  success: z.literal(true),
  data: checkDataSchema
}).passthrough();

export type UpdateCheckData = z.infer<typeof checkDataSchema>;

export async function requestUpdateOffer(input: {
  apiBaseUrl: string;
  allowedApiOrigin: string;
  currentVersion: string;
  channel: UpdateChannel;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<UpdateCheckData> {
  const endpoint = new URL("client-updates/check", `${input.apiBaseUrl.replace(/\/+$/, "")}/`);
  const allowedOrigin = new URL(input.allowedApiOrigin);
  if (endpoint.protocol !== "https:" || endpoint.origin !== allowedOrigin.origin) throw new Error("UPDATE_API_URL_BLOCKED");
  const response = await input.fetcher(endpoint, {
    method: "POST",
    credentials: "include",
    redirect: "error",
    signal: input.signal,
    headers: { "Content-Type": "application/json", "X-StudyRoom-Client-Version": input.currentVersion },
    body: JSON.stringify({ currentVersion: input.currentVersion, channel: input.channel, platform: "win32", arch: "x64" })
  });
  if (response.status === 401) throw new Error("UPDATE_LOGIN_REQUIRED");
  if (!response.ok) throw new Error(`UPDATE_API_HTTP_${response.status}`);
  return responseSchema.parse(await response.json()).data;
}
