import { sceneAssetMetadata, sceneAssetUrls } from "../assets/scenes/manifest.generated";

export type SceneKey = "mountain" | "beach" | "forest" | "library" | "cafe" | "snow";
export type SceneTimeKey = "morning" | "forenoon" | "noon" | "afternoon" | "dusk" | "night" | "midnight";
export type SceneTimeMode = "manual" | "smart" | "always";
export type SceneSizeKey = "large" | "standard" | "thumb";

export interface SceneFormatUrls {
  webp: string;
  jpg: string;
}

export type SceneAssetSet = Record<SceneSizeKey, SceneFormatUrls>;

interface ManifestEntry {
  sceneKey: SceneKey;
  timeKey: SceneTimeKey;
  sizeKey: SceneSizeKey;
  format: "webp" | "jpg";
  relativePath: string;
}

const catalog = {} as Record<SceneKey, Record<SceneTimeKey, SceneAssetSet>>;

for (const entry of sceneAssetMetadata.entries as ManifestEntry[]) {
  const scene = catalog[entry.sceneKey] ||= {} as Record<SceneTimeKey, SceneAssetSet>;
  const time = scene[entry.timeKey] ||= {} as SceneAssetSet;
  const size = time[entry.sizeKey] ||= {} as SceneFormatUrls;
  const moduleKey = `./generated/${entry.relativePath}`;
  const url = sceneAssetUrls[moduleKey];
  if (!url) throw new Error(`Missing bundled scene asset: ${moduleKey}`);
  size[entry.format] = url;
}

export const sceneAssetCatalog = catalog;
