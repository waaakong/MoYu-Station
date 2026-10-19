import { describe, expect, it } from "vitest";
import { MasterProcessor } from "../src/audio/effects/masterProcessor";
import { FakeAudioContext, FakeCompressorNode, FakeGainNode } from "./fakeAudioContext";

describe("MasterProcessor", () => {
  it("keeps a hard limiter in the connected output path", () => {
    const context = new FakeAudioContext();
    const processor = new MasterProcessor(context.asAudioContext());
    const compressor = context.compressors[0] as FakeCompressorNode;
    const limiter = context.compressors[1] as FakeCompressorNode;
    expect(limiter.threshold.value).toBe(-1);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.connections[0]).toBe(context.analysers[0]);
    expect(context.analysers[0]?.connections[0]).toBe(processor.output);

    processor.apply({
      normalizationEnabled: true,
      lowVolumeCompensationEnabled: true,
      compressorEnabled: true
    });
    const normalization = (processor.input as unknown as FakeGainNode).connections[0] as FakeGainNode;
    const compensation = normalization.connections[0] as FakeGainNode;
    expect(normalization.gain.value).toBe(1.1);
    expect(compensation.gain.value).toBe(1.08);
    expect(compressor.ratio.value).toBe(4);

    processor.apply({
      normalizationEnabled: false,
      lowVolumeCompensationEnabled: false,
      compressorEnabled: false
    });
    expect(compressor.ratio.value).toBe(1);
    expect(limiter.ratio.value).toBe(20);
  });
});
