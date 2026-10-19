import { sceneAssetCatalog, type SceneAssetSet, type SceneKey, type SceneTimeKey } from "../scenes/sceneAssetCatalog";

export const sceneKeys = ["mountain", "beach", "forest", "library", "cafe", "snow"] as const satisfies readonly SceneKey[];

export const timePoints = [
  { key: "morning", name: "早晨", desc: "柔光、清醒、开始进入状态" },
  { key: "forenoon", name: "上午", desc: "明亮、干净、适合效率学习" },
  { key: "noon", name: "中午", desc: "暖白、安静、适合轻阅读" },
  { key: "afternoon", name: "下午", desc: "金光、稳定、适合长时段" },
  { key: "dusk", name: "黄昏", desc: "橙调、松弛、适合复盘" },
  { key: "night", name: "夜晚", desc: "暗场、聚焦、适合冲刺" },
  { key: "midnight", name: "深夜", desc: "低光、私密、适合独处" }
] as const;

const copy: Record<SceneKey, { name: string; desc: string }> = {
  mountain: { name: "高山湖泊", desc: "山体、湖面倒影和远处天光，像先走到一扇开阔的窗前。" },
  beach: { name: "海边沙滩", desc: "浅海、白沙和晴朗天光，让专注更轻、更通透。" },
  forest: { name: "森林", desc: "树影、雾气和穿林高光，适合从疲惫中慢慢恢复。" },
  library: { name: "图书馆", desc: "高书架、暖灯和安静秩序，适合阅读、整理和深度输入。" },
  cafe: { name: "雨天咖啡馆", desc: "窗边雨痕、咖啡香和室内暖光，适合写作和复盘。" },
  snow: { name: "雪山窗边", desc: "窗内安静、窗外雪山，像坐在远离城市的一角。" }
};

export interface SceneDefinition {
  key: SceneKey;
  name: string;
  desc: string;
  assets: Record<SceneTimeKey, SceneAssetSet>;
  images: Record<SceneTimeKey, string>;
}

export const scenes: SceneDefinition[] = sceneKeys.map((key) => ({
  key,
  ...copy[key],
  assets: sceneAssetCatalog[key],
  images: Object.fromEntries(timePoints.map((time) => [time.key, sceneAssetCatalog[key][time.key].large.webp])) as Record<SceneTimeKey, string>
}));

export function timeFromSystem(date = new Date()): SceneTimeKey {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 360 && minutes < 540) return "morning";
  if (minutes >= 540 && minutes < 690) return "forenoon";
  if (minutes >= 690 && minutes < 840) return "noon";
  if (minutes >= 840 && minutes < 1020) return "afternoon";
  if (minutes >= 1020 && minutes < 1140) return "dusk";
  if (minutes >= 1140 && minutes < 1380) return "night";
  return "midnight";
}
