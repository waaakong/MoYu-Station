import { describe, expect, it } from "vitest";
import { Equalizer } from "../src/audio/effects/equalizer";
import { EQUALIZER_FREQUENCIES } from "../src/audio/effects/equalizerPresets";
import { FakeAudioContext, FakeGainNode } from "./fakeAudioContext";

describe("Equalizer", () => {
  it("builds the fixed ten-band chain and protects positive gain with preamp", () => {
    const context = new FakeAudioContext();
    const equalizer = new Equalizer(context.asAudioContext());
    expect(context.filters.map((filter) => filter.frequency.value)).toEqual(EQUALIZER_FREQUENCIES);
    expect(context.filters[0]?.type).toBe("lowshelf");
    expect(context.filters.at(-1)?.type).toBe("highshelf");

    equalizer.apply({
      enabled: true,
      presetId: "custom",
      bands: EQUALIZER_FREQUENCIES.map((frequencyHz, index) => ({ frequencyHz, gainDb: index === 3 ? 6 : -2 }))
    });
    const preamp = (equalizer.input as unknown as FakeGainNode).connections[0] as FakeGainNode;
    expect(preamp.gain.value).toBeCloseTo(10 ** (-6 / 20), 5);
    expect(context.filters[3]?.gain.value).toBe(6);

    equalizer.apply({
      enabled: false,
      presetId: "flat",
      bands: EQUALIZER_FREQUENCIES.map((frequencyHz) => ({ frequencyHz, gainDb: 12 }))
    });
    expect(preamp.gain.value).toBe(1);
    expect(context.filters.every((filter) => filter.gain.value === 0)).toBe(true);
  });
});
