import { describe, expect, it, vi } from "vitest";
import { AmbientMixer } from "../src/audio/ambient/ambientMixer";
import { AudioGraph } from "../src/audio/graph/audioGraph";
import { FakeAudioContext, FakeBufferSourceNode, FakeGainNode } from "./fakeAudioContext";

class FakeLoopAudio extends EventTarget {
  src = "";
  preload = "";
  loop = false;
  paused = true;
  currentTime = 0;
  duration = 60;
  rejectPlay = false;
  load(): void {}
  pause(): void { this.paused = true; }
  async play(): Promise<void> {
    if (this.rejectPlay) throw new Error("LOOP_FAILED");
    this.paused = false;
  }
  removeAttribute(name: string): void { if (name === "src") this.src = ""; }
}

describe("AmbientMixer", () => {
  it("enforces six unique sources", () => {
    const mixer = new AmbientMixer();
    const ids = ["white-noise", "pink-noise", "brown-noise", "rain", "cafe", "fireplace"] as const;
    ids.forEach((id) => mixer.add(id));
    expect(mixer.list()).toHaveLength(6);
    expect(() => mixer.add("white-noise")).toThrow(/AMBIENT_SOURCE_ALREADY_ADDED/);
    expect(() => mixer.add("waves")).toThrow(/AMBIENT_TRACK_LIMIT/);
  });

  it("starts generated sources and preserves mute and solo intent", async () => {
    const context = new FakeAudioContext();
    const changed = vi.fn();
    const mixer = new AmbientMixer({
      graph: new AudioGraph(() => context.asAudioContext()),
      random: () => 0.5,
      onChange: changed
    });
    const white = mixer.add("white-noise");
    const pink = mixer.add("pink-noise");
    await mixer.start(white.id);
    await mixer.start(pink.id);
    expect(mixer.list().map(({ status }) => status)).toEqual(["playing", "playing"]);
    expect((context.bufferSources[0] as FakeBufferSourceNode).startedAt?.offset).toBe(2);

    mixer.update(white.id, { solo: true, volume: 0.6 });
    const whiteGain = context.panners[0]?.connections[0] as FakeGainNode;
    const pinkGain = context.panners[1]?.connections[0] as FakeGainNode;
    expect(whiteGain.gain.value).toBe(0.6);
    expect(pinkGain.gain.value).toBe(0);
    mixer.update(white.id, { solo: false });
    expect(pinkGain.gain.value).toBe(0.45);
    mixer.update(pink.id, { muted: true });
    expect(pinkGain.gain.value).toBe(0);
    mixer.update(pink.id, { muted: false });
    mixer.update(white.id, { solo: true });
    mixer.stop(white.id, true);
    expect(pinkGain.gain.value).toBe(0.45);
    expect(changed).toHaveBeenCalled();
  });

  it("fades out before releasing a source and isolates a failed loop", async () => {
    const context = new FakeAudioContext();
    const timers: Array<() => void> = [];
    const loops = [new FakeLoopAudio()];
    loops[0].rejectPlay = true;
    const mixer = new AmbientMixer({
      graph: new AudioGraph(() => context.asAudioContext()),
      createAudio: () => loops.shift() as unknown as HTMLAudioElement,
      setTimer: (callback) => { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => undefined
    });
    const white = mixer.add("white-noise");
    const rain = mixer.add("rain");
    await mixer.start(white.id);
    await mixer.start(rain.id);
    expect(mixer.list().find(({ id }) => id === rain.id)?.status).toBe("error");
    expect(mixer.list().find(({ id }) => id === white.id)?.status).toBe("playing");

    mixer.stop(white.id);
    expect(mixer.list().find(({ id }) => id === white.id)?.status).toBe("stopped");
    expect(context.bufferSources[0]?.stopped).toBe(false);
    timers[0]?.();
    expect(context.bufferSources[0]?.stopped).toBe(true);
  });
});
