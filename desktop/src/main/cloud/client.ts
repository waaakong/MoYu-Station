import type { CloudRequest, CloudResponse } from "@studyroom/contracts";
import { cloudMediaPath, validateCloudRequest } from "./policy";

export type CloudFetch = (url: string, init?: RequestInit) => Promise<Response>;
const SESSION_END_CODES = new Set(["AUTH_REQUIRED", "AUTH_SESSION_EXPIRED", "ACCOUNT_LOGGED_IN_ELSEWHERE", "AUTH_ACCOUNT_BANNED"]);

export async function boundedBytes(response: Response, limit: number): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel(); throw new Error("CLOUD_RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.byteLength;
      if (length > limit) throw new Error("CLOUD_RESPONSE_TOO_LARGE");
      chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export class CloudClient {
  private owner: string | null = null;
  private ownerEpoch = 0;
  private readonly identityListeners = new Set<() => void>();
  get authenticatedOwner(): string | null { return this.owner; }
  get identityEpoch(): number { return this.ownerEpoch; }
  onIdentityChanged(listener: () => void): () => void { this.identityListeners.add(listener); return () => this.identityListeners.delete(listener); }
  private setIdentity(owner: string | null): void {
    if (owner !== this.owner) { this.owner = owner; this.ownerEpoch++; for (const listener of this.identityListeners) listener(); }
    this.identityChanged(owner);
  }
  private csrf = "";
  private csrfPending?: Promise<string>;
  private generation = 0;
  private controllers = new Set<AbortController>();
  constructor(
    readonly origin: string,
    private readonly fetcher: CloudFetch,
    private readonly clearSession: () => Promise<void>,
    private readonly endStreams: () => void,
    private readonly identityChanged: (owner: string | null) => void = () => {}
  ) {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) throw new Error("CLOUD_ORIGIN_INVALID");
  }

  private async raw(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetcher(this.origin + path, { ...init, credentials: "include", redirect: "error" });
  }

  private token(): Promise<string> {
    if (this.csrf) return Promise.resolve(this.csrf);
    if (!this.csrfPending) {
      const generation = this.generation;
      const pending = (async () => {
        const controller = new AbortController();
        this.controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const response = await this.raw("/api/auth/csrf", { signal: controller.signal });
          const body = JSON.parse(new TextDecoder().decode(await boundedBytes(response, 16384)));
          if (!response.ok || typeof body.data?.token !== "string" || !body.data.token || body.data.token.length > 1024) {
            throw new Error("CLOUD_CSRF_UNAVAILABLE");
          }
          if (generation !== this.generation) throw new Error("CLOUD_SESSION_CHANGED");
          return this.csrf = body.data.token;
        } finally { clearTimeout(timer); this.controllers.delete(controller); }
      })();
      this.csrfPending = pending;
      void pending.finally(() => { if (this.csrfPending === pending) this.csrfPending = undefined; }).catch(() => {});
    }
    return this.csrfPending;
  }

  invalidate(): void { this.generation++; this.csrf = ""; this.csrfPending = undefined; }
  dispose(): void { this.setIdentity(null); this.invalidate(); for (const controller of this.controllers) controller.abort(); this.endStreams(); }

  async request(input: unknown): Promise<CloudResponse> {
    return this.perform(validateCloudRequest(input));
  }

  /** Main-only updater operation: offer tokens must never cross the Renderer bridge. */
  async updateCheck(input: string, init?: RequestInit): Promise<Response> {
    if (input !== this.origin + "/api/client-updates/check" || init?.method !== "POST" || typeof init.body !== "string" || init.body.length > 8192) {
      throw new Error("CLOUD_REQUEST_BLOCKED");
    }
    JSON.parse(init.body);
    const result = await this.perform({ method: "POST", path: "/client-updates/check", json: init.body }, init.signal ?? undefined);
    return new Response(JSON.stringify(result.data), { status: result.status, headers: { "Content-Type": "application/json" } });
  }

  private async perform(request: CloudRequest, signal?: AbortSignal): Promise<CloudResponse> {
    signal?.throwIfAborted();
    if (['/auth/login', '/auth/logout'].includes(request.path)) { this.dispose(); this.setIdentity(null); }
    const generation = this.generation;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    this.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 15000);
    const logout = request.path === "/auth/logout";
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (request.method !== "GET") headers["X-CSRF-Token"] = await this.token();
      let body: BodyInit | undefined;
      if (request.json !== undefined) { headers["Content-Type"] = "application/json"; body = request.json; }
      if (request.form) {
        const form = new FormData();
        for (const part of request.form) {
          if (part.file) form.append(part.name, new Blob([new Uint8Array(part.file.bytes)], { type: part.file.type }), part.file.name);
          else form.append(part.name, part.value!);
        }
        body = form;
      }
      if (request.binary) { headers["Content-Type"] = request.binary.type; body = new Uint8Array(request.binary.bytes); }
      if (generation !== this.generation || controller.signal.aborted) throw new Error("CLOUD_SESSION_CHANGED");
      const response = await this.raw("/api" + request.path, { method: request.method, headers, body, signal: controller.signal });
      const text = new TextDecoder().decode(await boundedBytes(response, 5 * 1024 * 1024));
      const data = text ? JSON.parse(text) : null;
      if (generation !== this.generation || controller.signal.aborted) throw new Error("CLOUD_SESSION_CHANGED");
      if (data?.code === "AUTH_CSRF_INVALID") this.invalidate();
      // Temporary service failures are not revocation. Keep the verified in-memory
      // identity; protected operations still require server-side authorization.
      if (response.status === 401 || SESSION_END_CODES.has(data?.code)) { this.setIdentity(null); this.invalidate(); this.endStreams(); }
      if (['/auth/login', '/auth/me'].includes(request.path) && response.ok && data?.success) {
        const user = data.data;
        const exactId=user && (typeof user.id==='string' || typeof user.id==='number' && Number.isSafeInteger(user.id));
        this.setIdentity(exactId && !['BANNED', '封禁用户'].includes(String(user.userType)) && /^[1-9][0-9]{0,18}$/.test(String(user.id)) ? String(user.id) : null);
      }
      if (["/auth/login", "/profile/password"].includes(request.path) && response.ok && data?.success) { this.invalidate(); this.endStreams(); }
      // Never retry writes automatically: their server-side outcome may be unknown.
      return { status: response.status, data, retryAfter: response.headers.get("retry-after") || "" };
    } finally {
      signal?.removeEventListener("abort", abort);
      clearTimeout(timer); this.controllers.delete(controller);
      if (logout) { this.dispose(); await this.clearSession(); }
    }
  }

  async media(path: string): Promise<Response> {
    const generation = this.generation;
    const response = await this.raw(cloudMediaPath(path), { signal: AbortSignal.timeout(12000) });
    const type = response.headers.get("content-type")?.split(";")[0];
    const qualifiedGif = type === 'image/gif' && /^\/api\/media\/assets\/[0-9a-f-]{36}\/clear$/.test(path);
    if (!response.ok || !qualifiedGif && !["image/jpeg", "image/png", "image/webp"].includes(type || "")) {
      await response.body?.cancel(); return new Response(null, { status: 404 });
    }
    const privateClear = type==='image/png' && /^\/api\/media\/assets\/[0-9a-f-]{36}\/clear$/.test(path);
    const bytes = await boundedBytes(response, /\/display$/.test(path)?2*1024*1024:privateClear?8*1024*1024:5*1024*1024);
    if (generation !== this.generation) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type!, "Cache-Control": "no-store" } });
  }
}
