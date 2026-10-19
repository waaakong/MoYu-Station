export type NoiseColor = "white" | "pink" | "brown";

function clamp(value: number): number {
  return Math.min(0.85, Math.max(-0.85, value));
}

export function createNoiseBuffer(
  context: BaseAudioContext,
  color: NoiseColor,
  durationSeconds = 4,
  random: () => number = Math.random
): AudioBuffer {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * Math.max(1, durationSeconds)));
  const buffer = context.createBuffer(1, length, sampleRate);
  const output = buffer.getChannelData(0);
  let brown = 0;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;

  for (let index = 0; index < output.length; index += 1) {
    const white = random() * 2 - 1;
    if (color === "white") {
      output[index] = clamp(white * 0.55);
      continue;
    }
    if (color === "brown") {
      brown = (brown + 0.02 * white) / 1.02;
      output[index] = clamp(brown * 2.6);
      continue;
    }
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    output[index] = clamp(pink * 0.09);
  }
  return buffer;
}

export function sourceIdToNoiseColor(sourceId: string): NoiseColor | undefined {
  if (sourceId === "white-noise") return "white";
  if (sourceId === "pink-noise") return "pink";
  if (sourceId === "brown-noise") return "brown";
  return undefined;
}
