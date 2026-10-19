import { describe, expect, it, vi } from "vitest";
import { EntertainmentAudioController } from "../src/entertainment/audioController";

describe("entertainment audio controller", () => {
  it("keeps music ducked until the last lease is released", () => {
    const setDuck = vi.fn();
    const controller = new EntertainmentAudioController({ setDuck, playTone: async () => true });
    controller.acquire("breathing");
    controller.acquire("memory-cards");
    controller.release("breathing");
    controller.release("memory-cards");
    expect(setDuck.mock.calls.map(([factor]) => factor)).toEqual([0.45, 0.45, 0.45, 1]);
  });

  it("releases all leases and honors the local sound preference", async () => {
    const setDuck = vi.fn();
    const playTone = vi.fn(async () => true);
    const controller = new EntertainmentAudioController({ setDuck, playTone });
    controller.acquire("fish-sorting");
    controller.releaseAll();
    controller.setEnabled(false);
    expect(await controller.play("success")).toBe(false);
    expect(playTone).not.toHaveBeenCalled();
    expect(setDuck).toHaveBeenLastCalledWith(1);
  });
});
