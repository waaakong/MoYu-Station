import { entityId, type EntityId } from "@studyroom/contracts";
import { http } from "../services/http";
import { UploadRejectedError, UploadTerminalError, type AssetReceipt, type UploadJob, type UploadLookup, type ImageUploadDependencies } from "./imageUploadQueue";

export type SessionStamp = Readonly<{ accountId: string; generation: number }>;
export type MediaRequest = { method: "GET" | "POST"; path: string; body?: File | string; mime?: string; signal: AbortSignal; guard(): void };
export type MediaTransport = (request: MediaRequest) => Promise<{ status: number; data: unknown }>;
export type PublicationCommand = Readonly<{ requestId: string; kind: "POST" | "HALL" | "PRIVATE"; recipient: EntityId | null;
  content: string; scene: string | null; assets: readonly string[] }>;
export type Published = Readonly<{ kind: PublicationCommand["kind"]; targetId: EntityId }>;
export type PublicationLookup = { status: "committed"; publication: Published } | { status: "unconfirmed" };
export class MediaProtocolError extends Error { constructor() { super("MEDIA_RESPONSE_INVALID"); } }
export class PublicationRejectedError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX = 2 * 1024 * 1024;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MediaProtocolError();
  return value as Record<string, unknown>;
};
const uuid = (value: unknown): string => { if (typeof value !== "string" || !UUID.test(value)) throw new MediaProtocolError(); return value; };
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > max) throw new MediaProtocolError(); return value;
};

/** Uses existing CSRF/session handling. No automatic retries; raw File is not multipart or JSON. */
export const httpMediaTransport: MediaTransport = async request => {
  request.guard();
  const response = await http.request({ method: request.method, url: request.path, data: request.body,
    headers: request.mime ? { "Content-Type": request.mime } : undefined, signal: request.signal,
    mediaGuard: request.guard, timeout: 20000 });
  request.guard(); return { status: response.status, data: response.data };
};

export class MediaApi {
  readonly session: SessionStamp;
  constructor(session: SessionStamp, private readonly currentSession: () => SessionStamp | null,
    private readonly transport: MediaTransport = httpMediaTransport) {
    if (!session.accountId || !Number.isSafeInteger(session.generation) || session.generation < 0) throw new Error("MEDIA_SESSION_INVALID");
    this.session = Object.freeze({ ...session });
  }
  assertCurrent(signal: AbortSignal) {
    const current = this.currentSession();
    if (signal.aborted || !current || current.accountId !== this.session.accountId || current.generation !== this.session.generation) {
      throw new DOMException("图片任务所属会话已结束。", "AbortError");
    }
  }
  private async send(method: "GET" | "POST", path: string, signal: AbortSignal, body?: File | string, mime?: string): Promise<Record<string, unknown>> {
    const guard = () => this.assertCurrent(signal); guard();
    try {
      const response = await this.transport({ method, path, body, mime, signal, guard }); guard();
      if (response.status < 200 || response.status >= 300) throw new MediaProtocolError();
      const envelope = object(response.data);
      if (envelope.success !== true) throw new MediaProtocolError();
      return object(envelope.data);
    } catch (error) { guard(); throw error; }
  }
  private job(job: UploadJob) {
    this.assertCurrent(job.signal); uuid(job.requestId);
    if (job.scope.accountId !== this.session.accountId) throw new DOMException("上传账号不匹配。", "AbortError");
  }
  async upload(file: File, job: UploadJob): Promise<AssetReceipt> {
    this.job(job);
    if (!MIME.includes(file.type) || file.size <= 0 || file.size > MAX) throw new UploadTerminalError("UPLOAD_TERMINAL");
    let data: Record<string, unknown>;
    try { data = await this.send("POST", `/media/assets?clientUploadId=${job.requestId}`, job.signal, file, file.type); }
    catch (error) {
      const failure = error as { code?: string; status?: number };
      if (failure.status === 410 && failure.code === "MEDIA_EXPIRED") throw new UploadTerminalError("ASSET_EXPIRED");
      // Other HTTP errors may follow a committed claim; recover via lookup, not a new upload ID.
      throw error;
    }
    const result = parseUpload(data);
    if (result.status === "ready") return result.asset;
    if (result.status === "expired") throw new UploadTerminalError("ASSET_EXPIRED");
    if (result.status === "bound") throw new UploadTerminalError("ASSET_BOUND");
    if (result.status === "failed") {
      if (result.retryable) throw new UploadRejectedError(result.code);
      throw new UploadTerminalError("UPLOAD_TERMINAL");
    }
    throw new Error("MEDIA_OUTCOME_UNKNOWN");
  }
  async lookupUpload(job: UploadJob): Promise<UploadLookup> {
    this.job(job); return parseUpload(await this.send("GET", `/media/uploads/${job.requestId}`, job.signal));
  }
  async publish(command: PublicationCommand, signal: AbortSignal): Promise<Published> {
    const frozen = freezePublication(command);
    try { return parsePublished(await this.send("POST", "/media/publications", signal, JSON.stringify(frozen), "application/json"), frozen.kind); }
    catch (error) {
      const failure = error as { code?: string; status?: number };
      if ([400, 403, 409].includes(failure.status || 0) && ["MEDIA_PUBLICATION_INVALID", "MEDIA_PUBLICATION_FORBIDDEN",
        "MEDIA_PUBLICATION_CONFLICT", "MEDIA_ASSET_NOT_STAGED"].includes(failure.code || "")) throw new PublicationRejectedError(failure.code);
      throw error;
    }
  }
  async lookupPublication(command: PublicationCommand, signal: AbortSignal): Promise<PublicationLookup> {
    uuid(command.requestId);
    const data = await this.send("GET", `/media/publications/${command.requestId}`, signal);
    if (data.status === "unconfirmed" && data.publication === null) return { status: "unconfirmed" };
    if (data.status === "committed") return { status: "committed", publication: parsePublished(data.publication, command.kind) };
    throw new MediaProtocolError();
  }
}

/** Preparation stays explicit until the new candidate encoder is qualified; never silently use the legacy 1 MiB pipeline. */
export function createMediaUploadDependencies(api: MediaApi, prepare: ImageUploadDependencies["prepare"]): ImageUploadDependencies {
  return {
    prepare: async (file, job) => { api.assertCurrent(job.signal); const result = await prepare(file, job); api.assertCurrent(job.signal); return result; },
    upload: (file, job) => api.upload(file, job), lookup: job => api.lookupUpload(job)
  };
}

function parseUpload(data: Record<string, unknown>): UploadLookup {
  if (data.status === "ready") {
    const asset = object(data.asset), id = uuid(asset.id);
    const width = integer(asset.width, 4096), height = integer(asset.height, 4096);
    if (Math.max(width, height) > (Math.max(width, height) / Math.min(width, height) >= 3 ? 4096 : 2560)
        || !MIME.includes(String(asset.mime)) || asset.clearUrl !== `/api/media/assets/${id}/clear`
        || asset.thumbUrl !== `/api/media/assets/${id}/thumb`) throw new MediaProtocolError();
    integer(asset.bytes, MAX);
    return { status: "ready", asset: Object.freeze({ id, expiresAt: integer(asset.expiresAt) }) };
  }
  if (data.asset !== null || typeof data.retryable !== "boolean") throw new MediaProtocolError();
  if (data.status === "failed" && typeof data.code === "string" && /^[A-Z][A-Z0-9_]{1,79}$/.test(data.code)) {
    return { status: "failed", retryable: data.retryable, code: data.code };
  }
  if (data.retryable === false && ["pending", "missing", "expired", "bound"].includes(String(data.status))) {
    return { status: data.status as "pending" | "missing" | "expired" | "bound" };
  }
  throw new MediaProtocolError();
}
function parsePublished(value: unknown, kind: PublicationCommand["kind"]): Published {
  const result = object(value);
  if (result.kind !== kind) throw new MediaProtocolError();
  return Object.freeze({ kind, targetId: entityId(result.targetId) });
}
export function freezePublication(input: PublicationCommand): PublicationCommand {
  uuid(input.requestId);
  if (!["POST", "HALL", "PRIVATE"].includes(input.kind) || !Array.isArray(input.assets) || !input.assets.length
      || input.assets.length > (input.kind === "POST" ? 9 : 1) || new Set(input.assets).size !== input.assets.length) throw new Error("MEDIA_PUBLICATION_INVALID");
  input.assets.forEach(uuid);
  if (input.kind === "PRIVATE") entityId(input.recipient); else if (input.recipient !== null) throw new Error("MEDIA_PUBLICATION_INVALID");
  if (typeof input.content !== "string" || input.content.length > (input.kind === "POST" ? 500 : 1000)
    || input.scene !== null && !["default", "mountain", "beach", "forest", "library", "cafe", "snow"].includes(input.scene)
    || input.kind !== "POST" && input.scene !== null && input.scene !== "default") throw new Error("MEDIA_PUBLICATION_INVALID");
  return Object.freeze({ requestId: input.requestId, kind: input.kind, recipient: input.recipient, content: input.content,
    scene: input.scene, assets: Object.freeze([...input.assets]) });
}
