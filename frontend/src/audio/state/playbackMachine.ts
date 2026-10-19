import type { PlaybackState, RepeatMode } from "@studyroom/contracts";

export const INITIAL_PLAYBACK_STATE: Readonly<PlaybackState> = Object.freeze({
  status: "idle",
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  shuffle: false,
  repeatMode: "off"
});

export type PlaybackEvent =
  | { type: "LOAD"; itemId: string; positionMs?: number; durationMs?: number }
  | { type: "READY"; durationMs: number }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME"; positionMs: number; durationMs?: number }
  | { type: "SEEK"; positionMs: number }
  | { type: "VOLUME"; volume: number }
  | { type: "MUTE"; muted?: boolean }
  | { type: "SHUFFLE"; enabled?: boolean }
  | { type: "REPEAT"; mode: RepeatMode }
  | { type: "FAIL"; code: string }
  | { type: "CLEAR" };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function transitionPlayback(state: PlaybackState, event: PlaybackEvent): PlaybackState {
  switch (event.type) {
    case "LOAD":
      return {
        ...state,
        status: "loading",
        currentItemId: event.itemId,
        positionMs: Math.max(0, event.positionMs ?? 0),
        durationMs: Math.max(0, event.durationMs ?? 0),
        errorCode: undefined
      };
    case "READY":
      if (state.status !== "loading") return state;
      return { ...state, status: "paused", durationMs: Math.max(0, event.durationMs), errorCode: undefined };
    case "PLAY":
      if (!state.currentItemId || !["loading", "paused", "playing"].includes(state.status)) return state;
      return { ...state, status: "playing", errorCode: undefined };
    case "PAUSE":
      if (!state.currentItemId || !["playing", "loading", "error"].includes(state.status)) return state;
      return { ...state, status: "paused", errorCode: undefined };
    case "TIME": {
      if (!state.currentItemId) return state;
      const durationMs = Math.max(0, event.durationMs ?? state.durationMs);
      return { ...state, durationMs, positionMs: clamp(event.positionMs, 0, durationMs || Number.MAX_SAFE_INTEGER) };
    }
    case "SEEK":
      if (!state.currentItemId) return state;
      return { ...state, positionMs: clamp(event.positionMs, 0, state.durationMs || Number.MAX_SAFE_INTEGER) };
    case "VOLUME":
      return { ...state, volume: clamp(event.volume, 0, 1), muted: event.volume > 0 ? false : state.muted };
    case "MUTE":
      return { ...state, muted: event.muted ?? !state.muted };
    case "SHUFFLE":
      return { ...state, shuffle: event.enabled ?? !state.shuffle };
    case "REPEAT":
      return { ...state, repeatMode: event.mode };
    case "FAIL":
      return { ...state, status: "error", errorCode: event.code };
    case "CLEAR":
      return { ...INITIAL_PLAYBACK_STATE, volume: state.volume, muted: state.muted, shuffle: state.shuffle, repeatMode: state.repeatMode };
  }
}
