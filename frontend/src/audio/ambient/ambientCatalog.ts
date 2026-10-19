import type { AmbientSourceId } from "@studyroom/contracts";
import cafeUrl from "../../assets/audio/ambient/cafe.ogg?url";
import fireplaceUrl from "../../assets/audio/ambient/fireplace.ogg?url";
import rainUrl from "../../assets/audio/ambient/rain.ogg?url";
import wavesUrl from "../../assets/audio/ambient/waves.ogg?url";

export interface AmbientCatalogEntry {
  id: AmbientSourceId;
  name: string;
  description: string;
  kind: "generated" | "loop";
  assetUrl?: string;
}

export const AMBIENT_CATALOG: readonly AmbientCatalogEntry[] = Object.freeze([
  { id: "white-noise", name: "白噪音", description: "均匀清晰，遮蔽突发干扰", kind: "generated" },
  { id: "pink-noise", name: "粉噪音", description: "更柔和的高频，适合长时阅读", kind: "generated" },
  { id: "brown-noise", name: "棕噪音", description: "低频厚实，适合深度专注", kind: "generated" },
  { id: "rain", name: "窗外雨声", description: "细密雨滴与安静背景", kind: "loop", assetUrl: rainUrl },
  { id: "cafe", name: "咖啡馆", description: "低声交谈与温和空间感", kind: "loop", assetUrl: cafeUrl },
  { id: "fireplace", name: "壁炉", description: "干燥木柴与轻微爆裂声", kind: "loop", assetUrl: fireplaceUrl },
  { id: "waves", name: "海浪", description: "舒缓而有节律的近岸浪声", kind: "loop", assetUrl: wavesUrl }
]);

export function ambientCatalogEntry(sourceId: AmbientSourceId): AmbientCatalogEntry {
  const entry = AMBIENT_CATALOG.find(({ id }) => id === sourceId);
  if (!entry) throw new Error("AMBIENT_SOURCE_NOT_FOUND");
  return entry;
}
