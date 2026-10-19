import type { EqualizerState } from "@studyroom/contracts";
import { disconnectNode, rampAudioParam } from "../graph/audioNodeFactory";
import { EQUALIZER_FREQUENCIES } from "./equalizerPresets";

export class Equalizer {
  readonly input: GainNode;
  readonly output: GainNode;
  readonly filters: readonly BiquadFilterNode[];
  private readonly preamp: GainNode;

  constructor(private readonly context: BaseAudioContext) {
    this.input = context.createGain();
    this.output = context.createGain();
    this.preamp = context.createGain();
    this.filters = EQUALIZER_FREQUENCIES.map((frequencyHz, index) => {
      const filter = context.createBiquadFilter();
      filter.type = index === 0 ? "lowshelf" : index === EQUALIZER_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = frequencyHz;
      filter.Q.value = index === 0 || index === EQUALIZER_FREQUENCIES.length - 1 ? 0.7 : 1.1;
      filter.gain.value = 0;
      return filter;
    });

    this.input.connect(this.preamp);
    let previous: AudioNode = this.preamp;
    for (const filter of this.filters) {
      previous.connect(filter);
      previous = filter;
    }
    previous.connect(this.output);
  }

  apply(state: EqualizerState): void {
    const gains = state.bands.map((band) => Math.min(12, Math.max(-12, band.gainDb)));
    const maxPositiveGain = state.enabled ? Math.max(0, ...gains) : 0;
    const protectedPreamp = 10 ** (-maxPositiveGain / 20);
    rampAudioParam(this.preamp.gain, protectedPreamp, this.context);
    this.filters.forEach((filter, index) => {
      rampAudioParam(filter.gain, state.enabled ? (gains[index] ?? 0) : 0, this.context);
    });
  }

  destroy(): void {
    disconnectNode(this.input);
    disconnectNode(this.preamp);
    this.filters.forEach((filter) => disconnectNode(filter));
    disconnectNode(this.output);
  }
}
