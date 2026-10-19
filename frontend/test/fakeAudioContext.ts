export class FakeAudioParam {
  value: number;
  readonly targets: number[] = [];
  readonly curves: Float32Array[] = [];

  constructor(value = 0) {
    this.value = value;
  }

  cancelScheduledValues(): this { return this; }
  setValueAtTime(value: number): this { this.value = value; return this; }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    this.targets.push(value);
    return this;
  }
  setValueCurveAtTime(values: Float32Array): this {
    this.curves.push(values);
    this.value = values.at(-1) ?? this.value;
    return this;
  }
}

export class FakeAudioNode {
  readonly connections: FakeAudioNode[] = [];
  disconnected = false;

  connect(destination: FakeAudioNode): FakeAudioNode {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connections.length = 0;
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeBiquadNode extends FakeAudioNode {
  type: BiquadFilterType = "peaking";
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam();
}

export class FakeCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);
  readonly reduction = 0;
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  get frequencyBinCount(): number { return this.fftSize / 2; }
  getByteFrequencyData(values: Uint8Array): void { values.fill(64); }
  getByteTimeDomainData(values: Uint8Array): void { values.fill(128); }
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam();
}

export class FakeAudioBuffer {
  readonly channels: Float32Array[];
  readonly duration: number;

  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new Error("CHANNEL_NOT_FOUND");
    return data;
  }
}

export class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  startedAt?: { when: number; offset: number };
  stopped = false;

  start(when = 0, offset = 0): void { this.startedAt = { when, offset }; }
  stop(): void { this.stopped = true; }
}

export class FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType = "sine";
  readonly frequency = new FakeAudioParam(440);
  startedAt?: number;
  stoppedAt?: number;
  onended: ((this: OscillatorNode, event: Event) => unknown) | null = null;
  start(when = 0): void { this.startedAt = when; }
  stop(when = 0): void { this.stoppedAt = when; }
}

export class FakeAudioContext {
  readonly destination = new FakeAudioNode();
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadNode[] = [];
  readonly compressors: FakeCompressorNode[] = [];
  readonly analysers: FakeAnalyserNode[] = [];
  readonly mediaSources: FakeAudioNode[] = [];
  readonly panners: FakeStereoPannerNode[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  currentTime = 2;
  sampleRate = 48_000;
  state: AudioContextState = "suspended";
  closed = false;
  failGainAt?: number;

  createGain(): GainNode {
    if (this.failGainAt === this.gains.length) throw new Error("NODE_CREATION_FAILED");
    const node = new FakeGainNode();
    this.gains.push(node);
    return node as unknown as GainNode;
  }

  createBiquadFilter(): BiquadFilterNode {
    const node = new FakeBiquadNode();
    this.filters.push(node);
    return node as unknown as BiquadFilterNode;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    const node = new FakeCompressorNode();
    this.compressors.push(node);
    return node as unknown as DynamicsCompressorNode;
  }

  createAnalyser(): AnalyserNode {
    const node = new FakeAnalyserNode();
    this.analysers.push(node);
    return node as unknown as AnalyserNode;
  }

  createMediaElementSource(): MediaElementAudioSourceNode {
    const node = new FakeAudioNode();
    this.mediaSources.push(node);
    return node as unknown as MediaElementAudioSourceNode;
  }

  createStereoPanner(): StereoPannerNode {
    const node = new FakeStereoPannerNode();
    this.panners.push(node);
    return node as unknown as StereoPannerNode;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    const buffer = new FakeAudioBuffer(numberOfChannels, length, sampleRate);
    this.buffers.push(buffer);
    return buffer as unknown as AudioBuffer;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createOscillator(): OscillatorNode {
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  async resume(): Promise<void> { this.state = "running"; }
  async close(): Promise<void> { this.closed = true; this.state = "closed"; }

  asAudioContext(): AudioContext {
    return this as unknown as AudioContext;
  }
}
