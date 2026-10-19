export interface CrossfadeCurves {
  fadeOut: Float32Array;
  fadeIn: Float32Array;
}

export function equalPowerCrossfadeCurves(samples = 64): CrossfadeCurves {
  const length = Math.max(2, Math.floor(samples));
  const fadeOut = new Float32Array(length);
  const fadeIn = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const progress = index / (length - 1);
    fadeOut[index] = Math.cos(progress * Math.PI * 0.5);
    fadeIn[index] = Math.sin(progress * Math.PI * 0.5);
  }
  return { fadeOut, fadeIn };
}

export function scheduleEqualPowerCrossfade(
  outgoing: AudioParam,
  incoming: AudioParam,
  startTime: number,
  durationSeconds: number,
  samples = 64
): void {
  const duration = Math.max(0, durationSeconds);
  outgoing.cancelScheduledValues(startTime);
  incoming.cancelScheduledValues(startTime);
  if (duration === 0) {
    outgoing.setValueAtTime(0, startTime);
    incoming.setValueAtTime(1, startTime);
    return;
  }
  const curves = equalPowerCrossfadeCurves(samples);
  outgoing.setValueCurveAtTime(curves.fadeOut, startTime, duration);
  incoming.setValueCurveAtTime(curves.fadeIn, startTime, duration);
}
