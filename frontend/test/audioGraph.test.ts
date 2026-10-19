import { describe, expect, it } from "vitest";
import { AudioGraph } from "../src/audio/graph/audioGraph";
import { FakeAudioContext, FakeAudioNode } from "./fakeAudioContext";

describe("AudioGraph", () => {
  it("initializes once, routes sources, resumes on demand and closes cleanly", async () => {
    const context = new FakeAudioContext();
    const graph = new AudioGraph(() => context.asAudioContext());
    expect(graph.status()).toEqual({ state: "idle" });
    expect(graph.initialize()).toBe(true);
    expect(graph.initialize()).toBe(true);
    expect(graph.status()).toEqual({ state: "ready" });
    expect(context.analysers).toHaveLength(1);
    const destinationSource = context.gains.find((gain) => gain.connections.includes(context.destination));
    expect(destinationSource).toBeDefined();

    const music = new FakeAudioNode();
    const ambient = new FakeAudioNode();
    expect(graph.connectMusicSource(music as unknown as AudioNode)).toBe(true);
    expect(graph.connectAmbientSource(ambient as unknown as AudioNode)).toBe(true);
    expect(music.connections).toHaveLength(1);
    expect(ambient.connections).toHaveLength(1);

    graph.setMusicBus({ volume: 0.6, muted: false });
    graph.setMusicDucking(0.5);
    graph.setAmbientBus({ volume: 0.4, muted: true });
    expect(context.gains[0]?.gain.value).toBe(0.3);
    expect(context.gains[1]?.gain.value).toBe(0);
    expect(await graph.resume()).toBe(true);
    expect(context.state).toBe("running");
    expect(await graph.playUiTone("wood")).toBe(true);
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0]?.startedAt).toBe(context.currentTime);

    await graph.destroy();
    expect(context.closed).toBe(true);
    expect(graph.status()).toEqual({ state: "idle" });
  });

  it("releases a partially-created graph and reports an honest fallback state", async () => {
    const context = new FakeAudioContext();
    context.failGainAt = 1;
    const graph = new AudioGraph(() => context.asAudioContext());
    expect(graph.initialize()).toBe(false);
    expect(graph.status()).toEqual({ state: "unavailable", reason: "NODE_CREATION_FAILED" });
    await Promise.resolve();
    expect(context.closed).toBe(true);
    expect(graph.connectMusicSource(new FakeAudioNode() as unknown as AudioNode)).toBe(false);
  });
});
