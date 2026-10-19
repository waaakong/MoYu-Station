import type { MasterProcessingState } from "@studyroom/contracts";
import { disconnectNode, rampAudioParam } from "../graph/audioNodeFactory";

export class MasterProcessor {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  readonly output: GainNode;
  readonly limiter: DynamicsCompressorNode;
  private readonly normalization: GainNode;
  private readonly lowVolumeCompensation: GainNode;
  private readonly compressor: DynamicsCompressorNode;

  constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.normalization = context.createGain();
    this.lowVolumeCompensation = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    this.limiter = context.createDynamicsCompressor();
    this.analyser = context.createAnalyser();
    this.output = context.createGain();

    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 1;
    this.compressor.attack.value = 0.015;
    this.compressor.release.value = 0.18;

    this.limiter.threshold.value = -1;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.08;

    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;

    this.input.connect(this.normalization);
    this.normalization.connect(this.lowVolumeCompensation);
    this.lowVolumeCompensation.connect(this.compressor);
    this.compressor.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.output);
  }

  apply(state: MasterProcessingState): void {
    rampAudioParam(this.normalization.gain, state.normalizationEnabled ? 1.1 : 1, this.context);
    rampAudioParam(this.lowVolumeCompensation.gain, state.lowVolumeCompensationEnabled ? 1.08 : 1, this.context);
    rampAudioParam(this.compressor.ratio, state.compressorEnabled ? 4 : 1, this.context);
  }

  destroy(): void {
    disconnectNode(this.input);
    disconnectNode(this.normalization);
    disconnectNode(this.lowVolumeCompensation);
    disconnectNode(this.compressor);
    disconnectNode(this.limiter);
    disconnectNode(this.analyser);
    disconnectNode(this.output);
  }
}
