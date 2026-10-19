import type { QueueItem } from "@studyroom/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MusicDeckManager } from "../src/audio/core/musicDeckManager";
import { AudioGraph } from "../src/audio/graph/audioGraph";
import { FakeAudioContext } from "./fakeAudioContext";

class FakeAudioElement extends EventTarget {
  src = "";
  crossOrigin: string | null = null;
  preload = "";
  volume = 1;
  muted = false;
  paused = true;
  currentTime = 0;
  duration = 100;
  readyState = 4;
  rejectPlay = false;
  loadCalls = 0;

  load(): void { this.loadCalls += 1; }
  pause(): void { this.paused = true; }
  async play(): Promise<void> {
    if (this.rejectPlay) throw new Error("PLAY_FAILED");
    this.paused = false;
  }
  removeAttribute(name: string): void { if (name === "src") this.src = ""; if (name === "crossorigin") this.crossOrigin = null; }
  emit(name: string): void { this.dispatchEvent(new Event(name)); }
}

function item(id: string): QueueItem {
  return {
    id: `queue-${id}`,
    queuedAt: 1,
    track: {
      id: `track-${id}`,
      title: id,
      artist: "Local",
      durationMs: 100_000,
      source: { kind: "local", fileToken: `token-${id}` }
    }
  };
}

describe("MusicDeckManager", () => {
  afterEach(() => vi.useRealTimers());
  function bufferingFixture() {
    const elements = [new FakeAudioElement(), new FakeAudioElement()];let index = 0;
    const error = vi.fn(), buffering = vi.fn();
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error, buffering }, {
      graph: new AudioGraph(() => new FakeAudioContext().asAudioContext()), createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item('buffer'));
    return { manager, elements, error, buffering };
  }
  it('times out a real waiting state once, pauses, and ignores late playing until explicit retry', async () => {
    vi.useFakeTimers();const { manager, elements, error, buffering } = bufferingFixture();
    await manager.play();elements[0].currentTime = 12;elements[0].readyState = 2;elements[0].emit('waiting');elements[0].emit('stalled');
    expect(buffering).toHaveBeenCalledWith(true);await vi.advanceTimersByTimeAsync(14999);expect(error).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);expect(error).toHaveBeenCalledExactlyOnceWith('MEDIA_BUFFER_TIMEOUT');
    expect(elements[0].paused).toBe(true);expect(elements[0].currentTime).toBe(12);
    elements[0].paused = false;elements[0].readyState = 4;elements[0].emit('playing');expect(elements[0].paused).toBe(true);
    await manager.play();expect(elements[0].paused).toBe(false);expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['pause','clear','load','destroy'] as const)('%s cancels buffer timeout and preloaded deck events do not start it', async action => {
    vi.useFakeTimers();const { manager, elements, error } = bufferingFixture();await manager.play();
    elements[1].readyState = 1;elements[1].emit('waiting');expect(vi.getTimerCount()).toBe(0);
    elements[0].readyState = 1;elements[0].emit('waiting');
    if(action === 'load') manager.load(item('next'));else await manager[action]();
    await vi.advanceTimersByTimeAsync(16000);expect(error).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it('clears waiting on recovered playback and does not call buffered stalls failures', async () => {
    vi.useFakeTimers();const { manager, elements, error, buffering } = bufferingFixture();await manager.play();
    elements[0].emit('stalled');expect(buffering).not.toHaveBeenCalled();
    elements[0].readyState = 2;elements[0].emit('waiting');elements[0].readyState = 4;elements[0].emit('playing');
    await vi.advanceTimersByTimeAsync(16000);expect(error).not.toHaveBeenCalled();expect(buffering).toHaveBeenLastCalledWith(false);
  });
  it("requests anonymous CORS for token-backed audio but not bundled file assets", () => {
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    let index = 0;
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error: vi.fn() }, {
      graph: new AudioGraph(() => new FakeAudioContext().asAudioContext()),
      createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item("a"));
    expect(elements[0].crossOrigin).toBe("anonymous");
    const remote = item("b");
    remote.track.source = { kind: "builtin", assetId: "studyroom-media://provider/token" };
    manager.load(remote);
    expect(elements[0].crossOrigin).toBe("anonymous");
    remote.track.source = { kind: "builtin", assetId: "file:///app/sound.mp3" };
    manager.load(remote);
    expect(elements[0].crossOrigin).toBeNull();
  });
  it.each(["pause", "clear", "load"] as const)("%s cancels playback waiting for the audio context", async (action) => {
    const graph = new AudioGraph(() => new FakeAudioContext().asAudioContext());
    let finish!: (value: boolean) => void;
    vi.spyOn(graph, "resume").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    let index = 0;
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error: vi.fn() }, {
      graph, createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item("a"));
    const playing = manager.play();
    if (action === "load") manager.load(item("b"));
    else manager[action]();
    finish(true);
    await playing;
    expect(elements.every((element) => element.paused)).toBe(true);
  });

  it("pause cancels a crossfade waiting for resume and allows a later explicit play", async () => {
    const graph = new AudioGraph(() => new FakeAudioContext().asAudioContext());
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    let index = 0;
    const transitioned = vi.fn();
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error: vi.fn(), transitioned }, {
      graph, createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item("a"));
    manager.prepareNext(item("b"));
    await manager.play();
    let finish!: (value: boolean) => void;
    vi.spyOn(graph, "resume").mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    elements[0].currentTime = 97;
    elements[0].emit("timeupdate");
    manager.pause();
    finish(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(transitioned).not.toHaveBeenCalled();
    expect(elements.every((element) => element.paused)).toBe(true);
    await manager.play();
    expect(elements[0].paused).toBe(false);
  });

  it("preloads one next deck and completes a four-second transition without interrupting the outgoing deck", async () => {
    const context = new FakeAudioContext();
    const graph = new AudioGraph(() => context.asAudioContext());
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    let elementIndex = 0;
    let cleanup: (() => void) | undefined;
    const transitioned = vi.fn((next: QueueItem) => manager.prepareNext(item(`${next.track.title}-next`)));
    const manager = new MusicDeckManager({
      ready: vi.fn(),
      time: vi.fn(),
      ended: vi.fn(),
      error: vi.fn(),
      transitioned
    }, {
      graph,
      createAudio: () => elements[elementIndex++] as unknown as HTMLAudioElement,
      setTimer: (callback) => { cleanup = callback; return 1 as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => { cleanup = undefined; }
    });

    manager.load(item("a"));
    elements[0].emit("loadedmetadata");
    manager.prepareNext(item("b"));
    elements[1].emit("loadedmetadata");
    await manager.play();
    elements[0].currentTime = 96;
    elements[0].emit("timeupdate");
    await Promise.resolve();
    await Promise.resolve();

    expect(transitioned).toHaveBeenCalledWith(item("b"), 100_000);
    expect(elements[0].src).toContain("token-a");
    expect(context.gains.at(-2)?.gain.curves).toHaveLength(1);
    expect(context.gains.at(-1)?.gain.curves).toHaveLength(1);

    cleanup?.();
    expect(elements[0].src).toContain("token-b-next");
    expect(manager.positionMs()).toBe(0);
  });

  it("keeps the current deck playing when the incoming deck cannot start", async () => {
    const context = new FakeAudioContext();
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    elements[1].rejectPlay = true;
    let index = 0;
    const transitioned = vi.fn();
    const error = vi.fn();
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error, transitioned }, {
      graph: new AudioGraph(() => context.asAudioContext()),
      createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item("a"));
    manager.prepareNext(item("b"));
    await manager.play();
    elements[0].currentTime = 97;
    elements[0].emit("timeupdate");
    await Promise.resolve();
    await Promise.resolve();
    expect(elements[0].paused).toBe(false);
    expect(transitioned).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("uses one deck in low-performance and unknown-duration modes", async () => {
    const context = new FakeAudioContext();
    const elements = [new FakeAudioElement(), new FakeAudioElement()];
    let index = 0;
    const manager = new MusicDeckManager({ ready: vi.fn(), time: vi.fn(), ended: vi.fn(), error: vi.fn() }, {
      graph: new AudioGraph(() => context.asAudioContext()),
      createAudio: () => elements[index++] as unknown as HTMLAudioElement
    });
    manager.load(item("a"));
    manager.configureCrossfade(4, true);
    manager.prepareNext(item("b"));
    expect(elements[1].src).toBe("");

    manager.configureCrossfade(4, false);
    manager.prepareNext(item("b"));
    expect(elements[1].src).toContain("token-b");
    elements[0].duration = Number.NaN;
    elements[0].emit("loadedmetadata");
    expect(elements[1].src).toBe("");
  });
});
