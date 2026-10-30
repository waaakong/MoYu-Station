<template>
  <section class="sound-tool">
    <header><h2>声音调节</h2><p>这里直接控制声音中心，不会建立另一套播放器。</p></header>
    <div class="bus-grid">
      <label><span><strong>音乐</strong><small>{{ Math.round((sound.settings.musicBus.muted ? 0 : sound.settings.musicBus.volume) * 100) }}%</small></span><input type="range" min="0" max="1" step="0.01" :value="sound.settings.musicBus.muted ? 0 : sound.settings.musicBus.volume" aria-label="音乐音量" :aria-valuetext="`${Math.round((sound.settings.musicBus.muted ? 0 : sound.settings.musicBus.volume) * 100)}%${sound.settings.musicBus.muted ? '，已静音' : ''}`" :title="`${Math.round((sound.settings.musicBus.muted ? 0 : sound.settings.musicBus.volume) * 100)}%`" @input="setMusic" /><button class="sr-glass-control" type="button" @click="sound.setMusicBus(sound.settings.musicBus.volume, !sound.settings.musicBus.muted)">{{ sound.settings.musicBus.muted ? '恢复音乐' : '静音音乐' }}</button></label>
      <label><span><strong>环境音</strong><small>{{ Math.round((sound.settings.ambientBus.muted ? 0 : sound.settings.ambientBus.volume) * 100) }}%</small></span><input type="range" min="0" max="1" step="0.01" :value="sound.settings.ambientBus.muted ? 0 : sound.settings.ambientBus.volume" aria-label="环境音音量" :aria-valuetext="`${Math.round((sound.settings.ambientBus.muted ? 0 : sound.settings.ambientBus.volume) * 100)}%${sound.settings.ambientBus.muted ? '，已静音' : ''}`" :title="`${Math.round((sound.settings.ambientBus.muted ? 0 : sound.settings.ambientBus.volume) * 100)}%`" @input="setAmbient" /><button class="sr-glass-control" type="button" @click="sound.setAmbientBus(sound.settings.ambientBus.volume, !sound.settings.ambientBus.muted)">{{ sound.settings.ambientBus.muted ? '恢复环境音' : '静音环境音' }}</button></label>
    </div>
    <section class="quick-sounds" aria-label="环境音快捷开关"><h3>环境音快捷开关</h3><div><button v-for="item in quickSources" :key="item.id" type="button" :class="{ active: isPlaying(item.id), 'sr-glass-control': isPlaying(item.id) }" @click="toggle(item.id)"><AppIcon :name="item.icon" /><strong>{{ item.name }}</strong><small>{{ isPlaying(item.id) ? '播放中' : '点击开启' }}</small></button></div></section>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import type { AmbientSourceId } from "@studyroom/contracts";
import type { IconName } from "../../components/icons/paths";
import { ref } from "vue";
import { useSoundStore } from "../../stores/sound";
const sound = useSoundStore();
const error = ref("");
const quickSources: Array<{ id: AmbientSourceId; name: string; icon: IconName }> = [{ id: "rain", name: "雨声", icon: "rain" }, { id: "cafe", name: "咖啡馆", icon: "cup" }, { id: "fireplace", name: "炉火", icon: "fire" }, { id: "waves", name: "海浪", icon: "waves" }];
function setMusic(event: Event) { sound.setMusicBus(Number((event.target as HTMLInputElement).value), false); }
function setAmbient(event: Event) { sound.setAmbientBus(Number((event.target as HTMLInputElement).value), false); }
function track(sourceId: AmbientSourceId) { return sound.settings.ambientTracks.find((item) => item.sourceId === sourceId); }
function isPlaying(sourceId: AmbientSourceId) { return track(sourceId)?.status === "playing"; }
async function toggle(sourceId: AmbientSourceId) {
  error.value = "";
  try { const current = track(sourceId); if (current) await sound.toggleAmbient(current.id); else await sound.addAmbient(sourceId); }
  catch { error.value = "音频暂时无法启动，请点击页面后重试。"; }
}
</script>

<style scoped>
.sound-tool{display:grid;align-content:center;gap:28px;height:100%;padding:clamp(28px,4vw,64px)}header h2{margin:0 0 8px;font:500 46px var(--sr-font-display)}header p{margin:0;color:rgba(255,255,255,.62)}.bus-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.bus-grid label{display:grid;gap:18px;padding:22px;border:1px solid rgba(255,255,255,.14);border-radius:20px;background:rgba(0,0,0,.18)}.bus-grid label>span{display:flex;justify-content:space-between}.bus-grid small{color:rgba(255,255,255,.56)}input{width:100%;accent-color:#dce9df}.bus-grid button{justify-self:start;border:0;background:transparent;color:rgba(255,255,255,.7);font:800 12px var(--sr-font-sans);cursor:pointer}.quick-sounds h3{font-size:14px}.quick-sounds>div{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.quick-sounds button{display:grid;justify-items:start;gap:5px;min-height:112px;padding:18px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:rgba(255,255,255,.06);color:#fff;text-align:left;cursor:pointer}.quick-sounds button.active{border-color:rgba(221,236,226,.72);background:rgba(181,211,195,.18)}.quick-sounds button>span{font:500 25px var(--sr-font-display)}.quick-sounds button small{color:rgba(255,255,255,.5)}.error{color:#ffd2c7}@media(max-width:900px){.bus-grid{grid-template-columns:1fr}.quick-sounds>div{grid-template-columns:repeat(2,1fr)}}
.sound-tool{box-sizing:border-box;min-height:0;padding:clamp(16px,3vw,36px);gap:24px;overflow:auto;align-content:start}header h2{font-size:clamp(28px,3vw,40px)}header p{font-size:13px;line-height:1.7;color:var(--sr-color-text-muted)}.bus-grid label{gap:14px;border-radius:var(--sr-radius-panel,20px);background:#0b1511a8}.bus-grid input{min-height:44px;margin:0}.bus-grid button{min-height:44px;border-radius:var(--sr-radius-control,12px);border:1px solid var(--sr-color-line);padding-inline:14px;font-weight:600;color:var(--sr-color-text)}.bus-grid small,.quick-sounds button small{color:var(--sr-color-text-muted)}.quick-sounds button{border-radius:var(--sr-radius-panel,20px);transition:border-color 140ms ease,background-color 140ms ease}.sound-tool :is(button,input):focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}
@media(hover:hover) and (pointer:fine){.quick-sounds button:hover{border-color:var(--sr-color-line-strong)}}
@media(max-width:760px){.sound-tool{padding:16px;gap:20px}.bus-grid{gap:12px}.bus-grid label{padding:16px}.quick-sounds button{min-height:110px;padding:16px}}
.bus-grid label{background:rgba(10,15,23,.24);border-color:var(--sr-color-line);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
input{accent-color:var(--sr-color-accent)}
.quick-sounds button{background:rgba(255,255,255,.045);border-color:var(--sr-color-line);color:var(--sr-color-text)}
.quick-sounds button.active{color:var(--sr-color-text)}.quick-sounds button.active small{color:var(--sr-color-text)}
</style>
