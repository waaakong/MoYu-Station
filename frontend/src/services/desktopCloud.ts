import axios, { AxiosError, type AxiosAdapter } from "axios";
import type { CloudRequest, CloudStreamKind } from "@studyroom/contracts";

export const desktopCloudAdapter: AxiosAdapter = async config => {
  const guard = () => {
    config.mediaGuard?.();
    if (config.signal?.aborted) throw new axios.CanceledError();
  };
  guard();
  const bridge = window.studyRoomDesktop?.cloud;
  if (!bridge) throw new Error("DESKTOP_CLOUD_UNAVAILABLE");
  const request: CloudRequest = {
    method: String(config.method || "GET").toUpperCase() as CloudRequest["method"],
    path: axios.getUri({ url: config.url, params: config.params, paramsSerializer: config.paramsSerializer })
  };
  if (config.data instanceof Blob) {
    const gif = config.data.type === 'image/gif' && /^\/media\/assets\?clientUploadId=[0-9a-f-]{36}&purpose=sticker$/.test(request.path);
    const scene = /^\/media\/assets\?clientUploadId=[0-9a-f-]{36}&purpose=scene$/.test(request.path);
    if (!gif && !["image/jpeg", "image/png", "image/webp"].includes(config.data.type) || config.data.size > (scene?20:gif?5:2) * 1024 * 1024) throw new Error("MEDIA_CANDIDATE_INVALID");
    request.binary = { type: config.data.type as NonNullable<CloudRequest["binary"]>["type"], bytes: new Uint8Array(await config.data.arrayBuffer()) };
  } else if (config.data instanceof FormData) {
    request.form = [];
    for (const [name, value] of config.data.entries()) {
      request.form.push(typeof value === "string" ? { name, value } : {
        name, file: { name: value.name, type: value.type, bytes: new Uint8Array(await value.arrayBuffer()) }
      });
    }
  } else if (config.data !== undefined && config.data !== null) {
    request.json = typeof config.data === "string" ? config.data : JSON.stringify(config.data);
  }
  guard();
  const result = await bridge.request(request);
  guard();
  const response = { status: result.status, statusText: "", data: result.data, headers: { "retry-after": result.retryAfter }, config };
  if (config.validateStatus && !config.validateStatus(result.status)) throw new AxiosError("云端请求失败", "ERR_BAD_RESPONSE", config, undefined, response);
  return response;
};

export class DesktopCloudStream extends EventTarget {
  readonly id = crypto.randomUUID();
  readyState = 0;
  onerror: (() => void) | null = null;
  private unsubscribe: () => void;
  private bridge = window.studyRoomDesktop!.cloud!;
  constructor(kind: CloudStreamKind) {
    super();
    this.unsubscribe = this.bridge.onStreamEvent(event => {
      if (event.id !== this.id || this.readyState === 3) return;
      if (event.type === "open") { this.readyState = 1; this.dispatchEvent(new Event("open")); }
      else if (event.type === "message") this.dispatchEvent(new MessageEvent(event.event || "message", { data: event.data }));
      else if (event.type === "error") this.fail();
      else { if (kind === "dashboard") this.onerror?.(); this.finish(); }
    });
    void this.bridge.openStream({ id: this.id, kind }).catch(() => this.fail());
  }
  send(data: string): void {
    if (this.readyState !== 1) throw new Error("聊天连接尚未就绪");
    void this.bridge.sendChat({ id: this.id, data }).catch(() => this.fail());
  }
  close(): void { if (this.readyState === 3) return; this.finish(); void this.bridge.closeStream(this.id).catch(() => {}); }
  private finish(): void { if (this.readyState === 3) return; this.readyState = 3; this.unsubscribe(); this.dispatchEvent(new Event("close")); }
  private fail(): void { if (this.readyState === 3) return; this.dispatchEvent(new Event("error")); this.onerror?.(); this.close(); }
}
