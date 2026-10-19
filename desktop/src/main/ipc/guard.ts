import type { IpcMainInvokeEvent } from "electron";
import type { IpcChannel } from "@studyroom/contracts";

interface RateState {
  windowStartedAt: number;
  calls: number;
  inFlight: number;
}

export class IpcGuard {
  private readonly states = new Map<string, RateState>();
  hasOtherInFlight(channel: IpcChannel): boolean {
    return [...this.states.entries()].some(([key, state]) => !key.endsWith(`:${channel}`) && state.inFlight > 0);
  }

  constructor(
    private readonly allowedWebContentsId: number,
    private readonly maxCallsPerSecond = 30,
    private readonly maxConcurrent = 4,
    private readonly now: () => number = Date.now
  ) {}

  async invoke<T>(
    channel: IpcChannel,
    event: IpcMainInvokeEvent,
    handler: () => Promise<T> | T
  ): Promise<T> {
    if (event.sender.id !== this.allowedWebContentsId || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("IPC_SENDER_REJECTED");
    }

    const key = `${event.sender.id}:${channel}`;
    const timestamp = this.now();
    const previous = this.states.get(key);
    const state = previous ?? { windowStartedAt: timestamp, calls: 0, inFlight: 0 };
    if (timestamp - state.windowStartedAt >= 1000) { state.windowStartedAt = timestamp; state.calls = 0; }

    state.calls += 1;
    if (state.calls > this.maxCallsPerSecond) throw new Error("IPC_RATE_LIMITED");
    if (state.inFlight >= this.maxConcurrent) throw new Error("IPC_CONCURRENCY_LIMITED");
    state.inFlight += 1;
    this.states.set(key, state);

    try {
      return await handler();
    } finally {
      state.inFlight -= 1;
    }
  }
}
