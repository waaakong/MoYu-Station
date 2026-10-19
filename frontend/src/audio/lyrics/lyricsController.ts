import type { TrackLyrics } from "@studyroom/contracts";
import { parseLrc, type LyricLine } from "./lrcParser";

export interface LyricsState {
  trackId?: string;
  lines: LyricLine[];
  currentIndex: number;
  offsetMs: number;
  loading: boolean;
  source?: TrackLyrics["source"];
}

export class LyricsController {
  private operation = 0;
  private cancelPending?: () => void;
  private state: LyricsState = { lines: [], currentIndex: -1, offsetMs: 0, loading: false };

  snapshot(): LyricsState {
    return { ...this.state, lines: [...this.state.lines] };
  }

  async load(
    trackId: string,
    lyricsLoader: () => Promise<TrackLyrics | undefined>,
    offsetLoader: () => Promise<number>
  ): Promise<LyricsState> {
    this.cancelPending?.();
    const operation = ++this.operation;
    this.state = { trackId, lines: [], currentIndex: -1, offsetMs: 0, loading: true };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: [TrackLyrics | undefined, number];
    let cancel!: () => void;
    const canceled = new Promise<[TrackLyrics | undefined, number]>(resolve => { cancel = () => resolve([undefined, 0]); });
    this.cancelPending = cancel;
    try {
      result = await Promise.race([
        Promise.all([lyricsLoader(), offsetLoader()]),
        canceled,
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('LYRICS_READ_TIMEOUT')), 15000); })
      ]);
    } catch (error) {
      if (operation !== this.operation) return this.snapshot();
      this.operation++;
      this.state = { trackId, lines: [], currentIndex: -1, offsetMs: 0, loading: false };
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      if (this.cancelPending === cancel) this.cancelPending = undefined;
    }
    const [lyrics, offset] = result;
    if (operation !== this.operation) return this.snapshot();
    this.state = {
      trackId,
      lines: lyrics ? parseLrc(lyrics.content).lines : [],
      currentIndex: -1,
      offsetMs: Number.isFinite(offset) ? Math.round(Math.min(10_000, Math.max(-10_000, offset))) : 0,
      loading: false,
      source: lyrics?.source
    };
    return this.snapshot();
  }

  clear(): void {
    this.cancelPending?.();
    this.cancelPending = undefined;
    this.operation += 1;
    this.state = { lines: [], currentIndex: -1, offsetMs: 0, loading: false };
  }

  setOffset(offsetMs: number): number {
    this.state.offsetMs = Math.round(Math.min(10_000, Math.max(-10_000, offsetMs)) / 500) * 500;
    return this.state.offsetMs;
  }

  update(positionMs: number): number {
    const target = Math.max(0, positionMs - this.state.offsetMs);
    let low = 0;
    let high = this.state.lines.length - 1;
    let match = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if ((this.state.lines[middle]?.timeMs ?? Number.MAX_SAFE_INTEGER) <= target) {
        match = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    this.state.currentIndex = match;
    return match;
  }
}
