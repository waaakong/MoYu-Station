export type AudioContextFactory = () => AudioContext;

export function createBrowserAudioContext(): AudioContext {
  const Constructor = globalThis.AudioContext;
  if (!Constructor) throw new Error("WEB_AUDIO_UNAVAILABLE");
  return new Constructor({ latencyHint: "playback" });
}

export function rampAudioParam(
  parameter: AudioParam,
  value: number,
  context: BaseAudioContext,
  seconds = 0.03
): void {
  const now = context.currentTime;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(parameter.value, now);
  parameter.linearRampToValueAtTime(value, now + Math.max(0, seconds));
}

export function disconnectNode(node?: AudioNode): void {
  try {
    node?.disconnect();
  } catch {
    // Disconnect is idempotent from the product's perspective.
  }
}
