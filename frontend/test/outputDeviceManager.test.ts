import { describe, expect, it, vi } from "vitest";
import { OutputDeviceManager } from "../src/audio/output/outputDeviceManager";
import { FakeAudioContext } from "./fakeAudioContext";

class FakeMediaDevices extends EventTarget {
  devices: MediaDeviceInfo[] = [];
  async enumerateDevices(): Promise<MediaDeviceInfo[]> { return this.devices; }
}

function device(kind: MediaDeviceKind, id: string, label: string): MediaDeviceInfo {
  return { kind, deviceId: id, label, groupId: "group", toJSON: () => ({}) };
}

describe("OutputDeviceManager", () => {
  it("lists only outputs without requesting microphone permission", async () => {
    const context = new FakeAudioContext().asAudioContext() as AudioContext & { setSinkId(id: string): Promise<void> };
    context.setSinkId = vi.fn(async () => undefined);
    const mediaDevices = new FakeMediaDevices();
    mediaDevices.devices = [device("audioinput", "mic", "Microphone"), device("audiooutput", "default", ""), device("audiooutput", "speaker", "Speakers")];
    const manager = new OutputDeviceManager(context, { mediaDevices: mediaDevices as unknown as MediaDevices });
    expect(manager.supported()).toBe(true);
    expect(await manager.list()).toEqual([
      { id: "default", label: "音频输出 1", isDefault: true },
      { id: "speaker", label: "Speakers", isDefault: false }
    ]);
    await manager.select("speaker");
    expect(context.setSinkId).toHaveBeenCalledWith("speaker");
  });

  it("falls back once when the selected output disappears", async () => {
    const context = new FakeAudioContext().asAudioContext() as AudioContext & { setSinkId(id: string): Promise<void> };
    context.setSinkId = vi.fn(async () => undefined);
    const mediaDevices = new FakeMediaDevices();
    mediaDevices.devices = [device("audiooutput", "speaker", "Speakers")];
    const fallback = vi.fn();
    const manager = new OutputDeviceManager(context, { mediaDevices: mediaDevices as unknown as MediaDevices, onFallback: fallback });
    await manager.select("speaker");
    manager.watch();
    mediaDevices.devices = [device("audiooutput", "default", "Default")];
    mediaDevices.dispatchEvent(new Event("devicechange"));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context.setSinkId).toHaveBeenLastCalledWith("");
    expect(fallback).toHaveBeenCalledTimes(1);
    manager.dispose();
  });
});
