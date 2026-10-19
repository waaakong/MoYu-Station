import type { EqualizerPresetId } from "@studyroom/contracts";

export const EQUALIZER_FREQUENCIES = [31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000] as const;

export const EQUALIZER_PRESETS: Readonly<Record<Exclude<EqualizerPresetId, "custom">, readonly number[]>> = Object.freeze({
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  focus: [-3, -2, -1, 0, 1, 2, 2, 1, 0, -1],
  warm: [2, 2, 1.5, 1, 0, -0.5, -1, -1, -0.5, 0],
  bright: [-1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 2, 1],
  deep: [3, 3, 2, 1, 0, -1, -1.5, -1, 0, 0]
});
