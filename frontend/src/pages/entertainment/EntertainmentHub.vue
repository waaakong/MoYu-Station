<template>
  <div class="hub-shell">
  <section class="tool-grid" aria-label="放松工具">
    <button v-for="tool in tools" :key="tool.id" class="tool-card" type="button" @click="$emit('open', tool.id)">
      <picture><source :srcset="tool.webp" type="image/webp" /><img :src="tool.jpg" alt="" loading="eager" decoding="async" /></picture>
      <span class="tool-card__shade"></span>
      <span class="tool-card__copy"><strong>{{ tool.name }}</strong><small>{{ tool.description }}</small></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
    </button>
  </section>
  <details class="legacy-tools"><summary>旧工具与声音（保留原存档）</summary><button v-for="tool in legacy" :key="tool.id" class="sr-glass-control" type="button" @click="$emit('open',tool.id)">{{ tool.name }}</button></details>
  </div>
</template>

<script setup lang="ts">
import { sceneAssetCatalog } from "../../scenes/sceneAssetCatalog";
import type { EntertainmentToolId } from "@studyroom/contracts";

// Keep the retired ID in storage contracts, but never expose it as a playable tool.
type AvailableToolId = Exclude<EntertainmentToolId, "fish-sorting"> | "ambient-quick";

const assets = [
  sceneAssetCatalog.forest.afternoon.standard,
  sceneAssetCatalog.cafe.dusk.standard,
  sceneAssetCatalog.mountain.afternoon.standard,
  sceneAssetCatalog.library.night.standard,
  sceneAssetCatalog.beach.afternoon.standard
];
const tools: Array<{ id: AvailableToolId; name: string; description: string; webp: string; jpg: string }> = [
  { id: "breathing", name: "一分钟呼吸", description: "跟随节奏，慢慢放松", ...assets[0] },
  { id: "wooden-fish", name: "电子木鱼", description: "敲几下，让思绪落地", ...assets[1] },
  { id: "puzzle", name: "风景拼图", description: "3×3／4×4／6×6，无编号还原风景", ...assets[2] },
  { id: "game2048", name: "2048", description: "方向合并，慢慢抵达 2048", ...assets[3] },
  { id: "minesweeper", name: "扫雷", description: "经典三档，首次揭开周围安全", ...assets[4] },
  { id: "spider", name: "蜘蛛纸牌", description: "单／双／四花色，完整经典规则", ...assets[3] }
];
const legacy:Array<{id:AvailableToolId;name:string}>=[{id:'ambient-quick',name:'声音调节'},{id:'memory-cards',name:'摸鱼翻翻牌'}];
defineEmits<{ open: [toolId: AvailableToolId] }>();
</script>

<style scoped>
.tool-grid{height:calc(100% - 45px)!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:repeat(2,minmax(160px,1fr));overflow:auto}.tool-grid .tool-card{min-height:160px}.legacy-tools{height:auto!important;margin-top:10px;font-size:12px;color:#c6d4c9}.legacy-tools button{margin:6px;border:1px solid #ffffff40;background:#ffffff12;color:inherit;border-radius:6px;padding:8px;cursor:pointer}@media(max-width:600px){.tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;min-height:560px}.tool-grid .tool-card{min-height:170px}}
.tool-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;min-height:0}.tool-card{position:relative;min-height:330px;overflow:hidden;border:1px solid rgba(255,255,255,.2);border-radius:22px;padding:0;background:#17201d;color:#fff;text-align:left;cursor:pointer;box-shadow:0 18px 48px rgba(0,0,0,.18);transition:transform 240ms cubic-bezier(.22,1,.36,1),border-color 240ms ease}.tool-card:hover{transform:translateY(-5px);border-color:rgba(255,255,255,.52)}.tool-card picture,.tool-card img,.tool-card__shade{position:absolute;inset:0;width:100%;height:100%}.tool-card img{object-fit:cover;transition:transform 500ms cubic-bezier(.22,1,.36,1)}.tool-card:hover img{transform:scale(1.035)}.tool-card__shade{background:linear-gradient(180deg,rgba(9,13,12,.05) 28%,rgba(9,13,12,.86) 100%)}.tool-card__copy{position:absolute;z-index:1;left:20px;right:20px;bottom:22px;display:grid;gap:7px}.tool-card strong{font-family:var(--sr-font-display);font-size:clamp(19px,1.55vw,26px);font-weight:700}.tool-card small{color:rgba(255,255,255,.68);font-size:12px;line-height:1.5}.tool-card svg{position:absolute;z-index:1;right:17px;top:17px;width:24px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.72}@media(max-width:1365px),(max-height:760px){.tool-grid{gap:10px}.tool-card{min-height:250px;border-radius:18px}.tool-card__copy{left:15px;right:15px;bottom:16px}.tool-card small{font-size:11px}}@media(max-width:1050px){.tool-grid{grid-template-columns:repeat(3,minmax(0,1fr));overflow:auto}.tool-card{min-height:220px}}
.hub-shell{height:100%;display:flex;flex-direction:column;min-height:0;gap:12px}.tool-grid{height:auto!important;flex:1;grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:repeat(2,minmax(160px,1fr));gap:14px;overflow:auto;scrollbar-gutter:stable}.tool-grid .tool-card{min-height:160px;border-radius:var(--sr-radius-panel,20px);box-shadow:none;transition:border-color 140ms ease,transform 140ms var(--sr-ease-out)}.tool-card:hover{transform:none}.tool-card img{transition:transform 240ms var(--sr-ease-out)}.tool-card:hover img{transform:none}.tool-card strong{font-size:24px;font-weight:550}.tool-card small{color:#d0d9d2;font-size:12px}.tool-card__shade{background:linear-gradient(180deg,#08130b14 20%,#07110eef 100%)}.tool-card:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:-5px}.tool-card:active{transform:scale(.985)}.legacy-tools{flex:none;margin:0;height:auto!important;color:var(--sr-color-text-muted);font-size:12px}.legacy-tools summary{min-height:44px;line-height:44px;cursor:pointer;width:fit-content;border-radius:8px}.legacy-tools summary:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:2px}.legacy-tools button{height:44px;padding-inline:16px;border-radius:var(--sr-radius-control,12px);margin:0 8px 0 0}.legacy-tools button:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:2px}
@media(hover:hover) and (pointer:fine){.tool-card:hover{border-color:#dce7cd88}.tool-card:hover img{transform:scale(1.02)}}
@media(max-width:760px){.hub-shell{height:auto;min-height:100%}.tool-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(3,minmax(170px,1fr));min-height:0;flex:none;gap:10px}.tool-card__copy{left:14px;right:14px;bottom:16px}.tool-card strong{font-size:22px}.tool-card small{font-size:11px}.legacy-tools{padding-bottom:8px}}
@media(prefers-reduced-motion:reduce){.tool-card,.tool-card img{transition:none}.tool-card:hover img,.tool-card:active{transform:none}}
@media(min-width:761px) and (max-height:760px){.tool-grid{grid-template-rows:repeat(2,minmax(140px,1fr))}.tool-grid .tool-card{min-height:140px}.tool-card__copy{bottom:14px}.tool-card strong{font-size:22px}}
.tool-grid .tool-card{background:var(--sr-color-surface-solid);border-color:var(--sr-material-edge);box-shadow:inset 0 1px 0 rgba(255,255,255,.24)}
.tool-card__shade{background:linear-gradient(180deg,rgba(10,15,23,.03) 20%,rgba(10,15,23,.9) 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
.tool-card small{color:var(--sr-color-text-muted)}
@media(hover:hover) and (pointer:fine){.tool-card:hover{border-color:var(--sr-color-focus)}}
</style>
