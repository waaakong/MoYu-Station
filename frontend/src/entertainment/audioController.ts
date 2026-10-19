import { sharedAudioGraph } from "../audio/runtime/audioRuntime";
import type { UiTone } from "../audio/graph/audioGraph";
import { usePlayerStore } from "../stores/player";

export interface EntertainmentAudioActions {
  setDuck(factor: number): void;
  playTone(tone: UiTone): Promise<boolean>;
}

function defaultActions(): EntertainmentAudioActions {
  return {
    setDuck: (factor) => usePlayerStore().setRuntimeMusicDuck(factor),
    playTone: (tone) => sharedAudioGraph.playUiTone(tone)
  };
}

export class EntertainmentAudioController {
  private readonly leases = new Set<string>();
  private enabled = true;

  constructor(private readonly actions: EntertainmentAudioActions = defaultActions()) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  acquire(owner: string): void {
    if (!owner) return;
    this.leases.add(owner);
    this.syncDuck();
  }

  release(owner: string): void {
    this.leases.delete(owner);
    this.syncDuck();
  }

  releaseAll(): void {
    this.leases.clear();
    this.syncDuck();
  }

  async play(tone: UiTone): Promise<boolean> {
    return this.enabled ? this.actions.playTone(tone) : false;
  }

  activeLeaseCount(): number { return this.leases.size; }

  private syncDuck(): void {
    this.actions.setDuck(this.leases.size > 0 ? 0.45 : 1);
  }
}

export const entertainmentAudio = new EntertainmentAudioController();
