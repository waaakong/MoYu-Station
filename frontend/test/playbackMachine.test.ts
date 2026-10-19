import type { PlaybackState, QueueItem } from "@studyroom/contracts";
import { describe, expect, it } from "vitest";
import { insertAfterCurrent, moveQueueItem, nextQueueIndex, removeQueueItem } from "../src/audio/core/queue";
import { INITIAL_PLAYBACK_STATE, transitionPlayback } from "../src/audio/state/playbackMachine";

function item(id: string): QueueItem {
  return { id, queuedAt: 1, track: { id: `track-${id}`, title: id, artist: "Local", source: { kind: "local", fileToken: `token-${id}` } } };
}

describe("playback state machine", () => {
  it("rejects play, pause, time and seek when no item is loaded", () => {
    const initial = { ...INITIAL_PLAYBACK_STATE };
    expect(transitionPlayback(initial, { type: "PLAY" })).toBe(initial);
    expect(transitionPlayback(initial, { type: "PAUSE" })).toBe(initial);
    expect(transitionPlayback(initial, { type: "SEEK", positionMs: 100 })).toBe(initial);
    expect(transitionPlayback(initial, { type: "TIME", positionMs: 100 })).toBe(initial);
  });

  it("moves through loading, paused, playing and error states", () => {
    let state: PlaybackState = { ...INITIAL_PLAYBACK_STATE };
    state = transitionPlayback(state, { type: "LOAD", itemId: "q1", positionMs: 500 });
    expect(state).toMatchObject({ status: "loading", currentItemId: "q1", positionMs: 500 });
    state = transitionPlayback(state, { type: "READY", durationMs: 1000 });
    expect(state.status).toBe("paused");
    state = transitionPlayback(state, { type: "PLAY" });
    expect(state.status).toBe("playing");
    state = transitionPlayback(state, { type: "TIME", positionMs: 1200 });
    expect(state.positionMs).toBe(1000);
    state = transitionPlayback(state, { type: "FAIL", code: "MEDIA_LOAD_FAILED" });
    expect(state).toMatchObject({ status: "error", errorCode: "MEDIA_LOAD_FAILED" });
  });

  it("clamps volume and keeps user settings when cleared", () => {
    let state = transitionPlayback({ ...INITIAL_PLAYBACK_STATE }, { type: "VOLUME", volume: 4 });
    state = transitionPlayback(state, { type: "MUTE" });
    state = transitionPlayback(state, { type: "SHUFFLE", enabled: true });
    state = transitionPlayback(state, { type: "REPEAT", mode: "all" });
    state = transitionPlayback(state, { type: "CLEAR" });
    expect(state).toMatchObject({ status: "idle", volume: 1, muted: true, shuffle: true, repeatMode: "all" });
  });
});

describe("queue algorithms", () => {
  const queue = [item("a"), item("b"), item("c")];

  it("inserts next without duplicating and reorders immutably", () => {
    expect(insertAfterCurrent(queue, "a", item("c")).map(({ id }) => id)).toEqual(["a", "c", "b"]);
    expect(moveQueueItem(queue, 2, 0).map(({ id }) => id)).toEqual(["c", "a", "b"]);
    expect(queue.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("removes one item without mutating the original queue", () => {
    expect(removeQueueItem(queue, "b").map(({ id }) => id)).toEqual(["a", "c"]);
    expect(removeQueueItem(queue, "missing")).toEqual(queue);
    expect(queue.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("supports sequential and repeat modes", () => {
    expect(nextQueueIndex(queue, 1, { shuffle: false, repeatMode: "off" })).toBe(2);
    expect(nextQueueIndex(queue, 2, { shuffle: false, repeatMode: "off" })).toBe(-1);
    expect(nextQueueIndex(queue, 2, { shuffle: false, repeatMode: "all" })).toBe(0);
    expect(nextQueueIndex(queue, 1, { shuffle: false, repeatMode: "one" })).toBe(1);
  });

  it("does not repeat a visited item while shuffle candidates remain", () => {
    expect(nextQueueIndex(queue, 0, { shuffle: true, repeatMode: "off", random: () => 0, visited: new Set(["b"]) })).toBe(2);
  });
});
