import { describe, expect, it, vi } from "vitest";
import { VisualizerController } from "../src/audio/visualizer/visualizerController";
import { FakeAnalyserNode } from "./fakeAudioContext";

describe("VisualizerController", () => {
  it("reuses arrays and cancels rendering while suppressed", () => {
    const analyser = new FakeAnalyserNode();
    const callbacks = new Map<number, FrameRequestCallback>();
    let id = 0;
    let now = 100;
    const cancel = vi.fn((frameId: number) => callbacks.delete(frameId));
    const render = vi.fn();
    const controller = new VisualizerController(analyser as unknown as AnalyserNode, render, {
      requestFrame: (callback) => { callbacks.set(++id, callback); return id; },
      cancelFrame: cancel,
      now: () => now
    });
    controller.start();
    callbacks.get(1)?.(now);
    const firstFrame = render.mock.calls[0]?.[0];
    now = 200;
    callbacks.get(2)?.(now);
    const secondFrame = render.mock.calls[1]?.[0];
    expect(firstFrame.frequency).toBe(secondFrame.frequency);
    expect(firstFrame.waveform).toBe(secondFrame.waveform);
    controller.setSuppressed(true);
    expect(controller.running()).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it("stops permanently when a renderer throws", () => {
    const analyser = new FakeAnalyserNode();
    let callback: FrameRequestCallback | undefined;
    const controller = new VisualizerController(analyser as unknown as AnalyserNode, () => { throw new Error("DRAW_FAILED"); }, {
      requestFrame: (next) => { callback = next; return 1; },
      cancelFrame: () => undefined,
      now: () => 100
    });
    controller.start();
    callback?.(100);
    expect(controller.running()).toBe(false);
  });
});
