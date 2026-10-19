import { desktopWebSocketUrl } from "../config/cloudEndpoint";
import { DesktopCloudStream } from "../services/desktopCloud";

export type RealtimeState = "idle" | "connecting" | "open" | "retrying" | "offline" | "closed";

type SocketLike = {
  readyState: number;
  addEventListener(type: string, listener: (event: any) => void): void;
  send(data: string): void;
  close(): void;
};

type RealtimeConnectionOptions<T> = {
  url: string;
  parse: (data: unknown) => T;
  onMessage?: (message: T) => void;
  onOpen?: (recovered: boolean) => void | Promise<void>;
  onStateChange?: (state: RealtimeState) => void;
  onProtocolError?: (error: Error) => void;
  socketFactory?: (url: string) => SocketLike;
  setTimer?: (callback: () => void, delay: number) => number;
  clearTimer?: (timer: number) => void;
  random?: () => number;
};

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000] as const;

export class RealtimeConnection<T> {
  private socket: SocketLike | null = null;
  private timer = 0;
  private attempts = 0;
  private disposed = false;
  private openedBefore = false;
  private stateValue: RealtimeState = "idle";

  constructor(private readonly options: RealtimeConnectionOptions<T>) {}

  get state(): RealtimeState {
    return this.stateValue;
  }

  start(): void {
    if (this.disposed || this.socket) return;
    this.connect();
  }

  send(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== 1) return false;
    this.socket.send(typeof payload === "string" ? payload : JSON.stringify(payload));
    return true;
  }

  retryNow(): void {
    if (this.disposed || this.stateValue === "open" || this.stateValue === "connecting") return;
    this.clearScheduledRetry();
    this.connect();
  }

  close(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearScheduledRetry();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.setState("closed");
  }

  private connect(): void {
    if (this.disposed) return;
    this.setState(this.attempts > 0 ? "retrying" : "connecting");
    const factory = this.options.socketFactory ?? ((url: string) => {
      if (!window.studyRoomDesktop?.cloud) return new WebSocket(url);
      const path = new URL(url).pathname;
      if (path !== "/ws/chat" && path !== "/ws/notifications") throw new Error("DESKTOP_SOCKET_BLOCKED");
      return new DesktopCloudStream(path === "/ws/chat" ? "chat" : "notifications");
    });
    const socket = factory(this.options.url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.disposed || socket !== this.socket) return;
      const recovered = this.openedBefore;
      this.openedBefore = true;
      this.attempts = 0;
      this.setState("open");
      void this.options.onOpen?.(recovered);
    });
    socket.addEventListener("message", (event) => {
      if (this.disposed || socket !== this.socket) return;
      try {
        const parsed = this.options.parse(event.data);
        this.options.onMessage?.(parsed);
      } catch (error) {
        this.options.onProtocolError?.(error instanceof Error ? error : new Error("实时消息解析失败。"));
      }
    });
    socket.addEventListener("error", () => {
      if (!this.disposed && socket === this.socket && this.stateValue !== "open") {
        this.setState("offline");
      }
    });
    socket.addEventListener("close", () => {
      if (socket !== this.socket) return;
      this.socket = null;
      if (!this.disposed) this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    const base = RETRY_DELAYS[Math.min(this.attempts, RETRY_DELAYS.length - 1)];
    this.attempts += 1;
    const random = this.options.random?.() ?? Math.random();
    const delay = Math.round(base * (0.9 + random * 0.2));
    this.setState("retrying");
    const setTimer = this.options.setTimer ?? ((callback, wait) => window.setTimeout(callback, wait));
    this.timer = setTimer(() => {
      this.timer = 0;
      this.connect();
    }, delay);
  }

  private clearScheduledRetry(): void {
    if (!this.timer) return;
    const clearTimer = this.options.clearTimer ?? ((timer) => window.clearTimeout(timer));
    clearTimer(this.timer);
    this.timer = 0;
  }

  private setState(state: RealtimeState): void {
    if (state === this.stateValue) return;
    this.stateValue = state;
    this.options.onStateChange?.(state);
  }
}

export function websocketUrl(path: string): string {
  if (window.studyRoomDesktop) return desktopWebSocketUrl(path);
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path.startsWith("/") ? path : `/${path}`}`;
}
