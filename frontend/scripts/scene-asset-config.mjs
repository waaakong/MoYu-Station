export const SCENE_KEYS = Object.freeze(["mountain", "beach", "forest", "library", "cafe", "snow"]);
export const TIME_KEYS = Object.freeze(["morning", "forenoon", "noon", "afternoon", "dusk", "night", "midnight"]);
export const SOURCE_DIMENSIONS = Object.freeze({ width: 1672, height: 941, channels: 3 });
export const VARIANT_SPECS = Object.freeze([
  Object.freeze({ key: "large", width: 1672 }),
  Object.freeze({ key: "standard", width: 1280 }),
  Object.freeze({ key: "thumb", width: 360 })
]);
export const FORMATS = Object.freeze(["webp", "jpg"]);
export const FORMAT_LIMITS = Object.freeze({
  webp: Object.freeze({ large: 350_000, standard: 240_000, thumb: 30_000 }),
  jpg: Object.freeze({ large: 450_000, standard: 300_000, thumb: 40_000 })
});
export const FORMAT_TARGETS = Object.freeze({
  webp: Object.freeze({ large: 280_000, standard: 210_000, thumb: 26_000 }),
  jpg: Object.freeze({ large: 360_000, standard: 260_000, thumb: 34_000 })
});
export const TOTAL_LIMITS = Object.freeze({ webp: 14_000_000, all: 32_000_000 });
export const QUALITY = Object.freeze({ start: 78, minimum: 54, step: 2 });

export function expectedHeight(width) {
  return Math.round(SOURCE_DIMENSIONS.height * width / SOURCE_DIMENSIONS.width);
}
