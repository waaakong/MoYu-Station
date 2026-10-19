import { net, type Session } from "electron";
import type { CloudStreamEvent, CloudStreamKind } from "@studyroom/contracts";
import { STUDYROOM_CLOUD_ORIGIN } from "../security/cloudOrigin";
import { validateChatFrame } from "./policy";

/** Split SSE frames with a bounded carry buffer, including chunked UTF-8 and CRLF. */
export class SseFrames {
  private carry = "";
  push(text: string): Array<{ event: string; data: string }> {
    this.carry += text;
    if (this.carry.length > 256 * 1024) throw new Error("CLOUD_STREAM_TOO_LARGE");
    const result: Array<{ event: string; data: string }> = [];
    let separator: RegExpExecArray | null;
    while ((separator = /\r?\n\r?\n/.exec(this.carry))) {
      const block = this.carry.slice(0, separator.index);
      this.carry = this.carry.slice(separator.index + separator[0].length);
      let event = "message"; const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) result.push({ event, data: data.join("\n") });
    }
    return result;
  }
}

export class CloudStreams {
  private connections = new Map<string, { kind: CloudStreamKind; close: () => void; send?: (data: string) => void }>();
  constructor(private readonly session: Session, private readonly emit: (event: CloudStreamEvent) => void) {}

  open(id: string, kind: CloudStreamKind): void {
    if (this.connections.has(id)) throw new Error("CLOUD_STREAM_DUPLICATE");
    // One connection per feature; close superseded connections on reconnect/navigation.
    for (const [key, item] of this.connections) if (item.kind === kind) this.close(key);
    if (kind !== "dashboard") this.openChat(id, kind);
    else this.openDashboard(id);
  }

  close(id: string): void {
    const item = this.connections.get(id); this.connections.delete(id);
    item?.close();
    if (item) this.emit({ id, type: "close" });
  }
  closeAll(): void { for (const id of this.connections.keys()) this.close(id); }
  send(id: string, data: string): void {
    validateChatFrame(data);
    const item = this.connections.get(id);
    if (!item?.send) throw new Error("CLOUD_STREAM_CLOSED");
    item.send(data);
  }

  private openChat(id: string, kind: "chat" | "notifications"): void {
    const url = STUDYROOM_CLOUD_ORIGIN.replace(/^https:/, "wss:") + "/ws/" + kind;
    // Chromium selects same-site cookies; onBeforeSendHeaders applies the exact desktop Origin.
    const socket = new net.WebSocket(url, { session: this.session, useSessionCookies: true });
    const handshake = setTimeout(() => this.close(id), 12000);
    this.connections.set(id, { kind, close: () => { clearTimeout(handshake); socket.close(); }, send: (data) => {
      if (kind === "notifications" && JSON.parse(data).type !== "PING") throw new Error("CLOUD_MESSAGE_BLOCKED");
      if (socket.readyState !== 1 || socket.bufferedAmount > 256 * 1024) throw new Error("CLOUD_STREAM_CLOSED");
      socket.send(data);
    } });
    socket.addEventListener("open", () => { clearTimeout(handshake); if (this.connections.has(id)) this.emit({ id, type: "open" }); });
    socket.addEventListener("message", (event) => {
      if (!this.connections.has(id)) return;
      const data = (event as MessageEvent).data;
      if (typeof data !== "string" || Buffer.byteLength(data) > 256 * 1024) { this.close(id); return; }
      this.emit({ id, type: "message", data });
    });
    socket.addEventListener("error", () => { if (this.connections.has(id)) { this.emit({ id, type: "error" }); this.close(id); } });
    socket.addEventListener("close", () => this.close(id));
  }

  private openDashboard(id: string): void {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), 12000);
    this.connections.set(id, { kind: "dashboard", close: () => { clearTimeout(timer); controller.abort(); } });
    void (async () => {
      try {
        const response = await this.session.fetch(STUDYROOM_CLOUD_ORIGIN + "/api/admin/dashboard/stream", {
          credentials: "include", redirect: "error", signal: controller.signal, headers: { Accept: "text/event-stream" }
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          await response.body?.cancel(); throw new Error("CLOUD_STREAM_REJECTED");
        }
        if (!this.connections.has(id)) { await response.body.cancel(); return; }
        this.emit({ id, type: "open" });
        const reader = response.body.getReader(); const decoder = new TextDecoder(); const frames = new SseFrames();
        try {
          while (!controller.signal.aborted) {
            clearTimeout(timer); timer = setTimeout(() => controller.abort(), 90000);
            const chunk = await reader.read(); if (chunk.done) break;
            for (const frame of frames.push(decoder.decode(chunk.value, { stream: true }))) {
              if (frame.event === "dashboard" && this.connections.has(id)) this.emit({ id, type: "message", ...frame });
            }
          }
        } finally { await reader.cancel().catch(() => {}); }
      } catch {
        if (this.connections.has(id)) this.emit({ id, type: "error" });
      } finally { this.close(id); }
    })();
  }
}
