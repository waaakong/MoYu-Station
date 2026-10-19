import type { VisualizerQuality } from "@studyroom/contracts";

export interface VisualizerFrame {
  frequency: Uint8Array<ArrayBuffer>;
  waveform: Uint8Array<ArrayBuffer>;
}

export interface VisualizerControllerOptions {
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
  now?: () => number;
}

const qualityConfig: Record<VisualizerQuality, { fftSize: number; fps: number }> = {
  low: { fftSize: 512, fps: 24 },
  medium: { fftSize: 1024, fps: 40 },
  high: { fftSize: 2048, fps: 60 }
};

export class VisualizerController {
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (id: number) => void;
  private readonly now: () => number;
  private frameId?: number;
  private frequency = new Uint8Array(0);
  private waveform = new Uint8Array(0);
  private quality: VisualizerQuality = "low";
  private suppressed = false;
  private lastFrameAt = 0;

  constructor(
    private readonly analyser: AnalyserNode,
    private readonly render: (frame: VisualizerFrame) => void,
    options: VisualizerControllerOptions = {}
  ) {
    this.requestFrame = options.requestFrame ?? requestAnimationFrame.bind(globalThis);
    this.cancelFrame = options.cancelFrame ?? cancelAnimationFrame.bind(globalThis);
    this.now = options.now ?? performance.now.bind(performance);
    this.configure("low");
  }

  configure(quality: VisualizerQuality): void {
    this.quality = quality;
    this.analyser.fftSize = qualityConfig[quality].fftSize;
    this.frequency = new Uint8Array(this.analyser.frequencyBinCount);
    this.waveform = new Uint8Array(this.analyser.fftSize);
  }

  start(): void {
    if (this.frameId !== undefined || this.suppressed) return;
    this.frameId = this.requestFrame(this.tick);
  }

  stop(): void {
    if (this.frameId !== undefined) this.cancelFrame(this.frameId);
    this.frameId = undefined;
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) this.stop();
    else this.start();
  }

  running(): boolean {
    return this.frameId !== undefined;
  }

  private readonly tick: FrameRequestCallback = () => {
    this.frameId = undefined;
    if (this.suppressed) return;
    const now = this.now();
    const minimumFrameMs = 1000 / qualityConfig[this.quality].fps;
    if (now - this.lastFrameAt >= minimumFrameMs) {
      this.lastFrameAt = now;
      this.analyser.getByteFrequencyData(this.frequency);
      this.analyser.getByteTimeDomainData(this.waveform);
      try {
        this.render({ frequency: this.frequency, waveform: this.waveform });
      } catch {
        this.suppressed = true;
        return;
      }
    }
    this.frameId = this.requestFrame(this.tick);
  };
}
