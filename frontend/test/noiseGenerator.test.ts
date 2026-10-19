import { describe, expect, it } from "vitest";
import { createNoiseBuffer } from "../src/audio/ambient/noiseGenerator";
import { FakeAudioContext } from "./fakeAudioContext";

function seededRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function averageDelta(values: Float32Array): number {
  let total = 0;
  for (let index = 1; index < values.length; index += 1) total += Math.abs(values[index] - values[index - 1]);
  return total / Math.max(1, values.length - 1);
}

describe("noise generator", () => {
  it("creates bounded finite noise with distinct spectral color behavior", () => {
    const context = new FakeAudioContext();
    const white = createNoiseBuffer(context.asAudioContext(), "white", 1, seededRandom()).getChannelData(0);
    const pink = createNoiseBuffer(context.asAudioContext(), "pink", 1, seededRandom()).getChannelData(0);
    const brown = createNoiseBuffer(context.asAudioContext(), "brown", 1, seededRandom()).getChannelData(0);
    for (const values of [white, pink, brown]) {
      expect(values.length).toBe(48_000);
      expect(values.every(Number.isFinite)).toBe(true);
      expect(Math.max(...values)).toBeLessThanOrEqual(0.85);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(-0.85);
    }
    expect(averageDelta(white)).toBeGreaterThan(averageDelta(pink));
    expect(averageDelta(pink)).toBeGreaterThan(averageDelta(brown));
  });
});
