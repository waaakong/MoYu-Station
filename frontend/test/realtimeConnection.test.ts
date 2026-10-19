import { describe, expect, it, vi } from "vitest";
import { RealtimeConnection } from "../src/realtime/realtimeConnection";

class FakeSocket {
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, Array<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }
  emit(type: string, event: any = {}) {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
  send(data: string) { this.sent.push(data); }
  close() { this.emit("close"); }
}

describe("RealtimeConnection", () => {
  it("reconnects with exponential delays and identifies recovery", () => {
    const sockets: FakeSocket[] = [];
    const scheduled: Array<{ callback: () => void; delay: number }> = [];
    const opens = vi.fn();
    const states: string[] = [];
    const connection = new RealtimeConnection({
      url: "ws://local/ws",
      parse: (data) => JSON.parse(String(data)),
      socketFactory: () => { const socket = new FakeSocket(); sockets.push(socket); return socket; },
      setTimer: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; },
      clearTimer: () => undefined,
      random: () => 0.5,
      onOpen: opens,
      onStateChange: (state) => states.push(state)
    });
    connection.start();
    sockets[0].emit("open");
    sockets[0].emit("close");
    expect(scheduled[0].delay).toBe(1000);
    scheduled[0].callback();
    sockets[1].emit("open");
    expect(opens.mock.calls).toEqual([[false], [true]]);
    expect(states).toContain("retrying");
  });

  it("does not retry after explicit close and reports protocol errors", () => {
    const socket = new FakeSocket();
    const schedule = vi.fn(() => 1);
    const protocolError = vi.fn();
    const connection = new RealtimeConnection({
      url: "ws://local/ws",
      parse: (data) => JSON.parse(String(data)),
      socketFactory: () => socket,
      setTimer: schedule,
      onProtocolError: protocolError
    });
    connection.start();
    socket.emit("open");
    socket.emit("message", { data: "broken" });
    connection.close();
    expect(protocolError).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
    expect(connection.state).toBe("closed");
  });
});
