<template>
  <section class="now-stage" aria-label="正在播放">
    <div class="now-stage__art">
      <TrackArtwork class="now-stage__cover" :track="track" resolve><BrandMark style="width:72px;height:72px" /></TrackArtwork>
      <VisualizerCanvas class="now-stage__viz" :mode="sound.settings.visualizer.mode" :quality="sound.settings.visualizer.quality" :suppressed="sound.lowPerformance" />
    </div>
    <div class="now-stage__copy">
      <span>NOW PLAYING</span>
      <strong>{{ track?.title || "等待一段声音" }}</strong>
      <small>{{ track?.artist || "从曲库或环境声音中选择" }}</small>
    </div>
    <div class="now-stage__visualizer">
      <label>视觉</label>
      <AppSelect aria-label="视觉效果" :value="sound.settings.visualizer.mode" @change="setMode"><option value="cover">封面微频谱</option><option value="spectrum">频谱</option><option value="waveform">波形</option><option value="particles">粒子</option><option value="off">关闭</option></AppSelect>
      <AppSelect aria-label="画面质量" :value="sound.settings.visualizer.quality" :disabled="sound.lowPerformance" @change="setQuality"><option value="low">节能</option><option value="medium">均衡</option><option value="high">精细</option></AppSelect>
    </div>
  </section>
</template>

<script setup lang="ts">
import TrackArtwork from '../../components/sound/TrackArtwork.vue';
import type { VisualizerMode, VisualizerQuality } from "@studyroom/contracts";
import { computed } from "vue";
import { usePlayerStore } from "../../stores/player";
import { useSoundStore } from "../../stores/sound";
import VisualizerCanvas from "./VisualizerCanvas.vue";
const player = usePlayerStore();
const sound = useSoundStore();
const track = computed(() => player.currentItem?.track);
function setMode(event: Event) { sound.setVisualizer({ ...sound.settings.visualizer, mode: (event.target as HTMLSelectElement).value as VisualizerMode }); }
function setQuality(event: Event) { sound.setVisualizer({ ...sound.settings.visualizer, quality: (event.target as HTMLSelectElement).value as VisualizerQuality }); }
</script>

<style scoped>
.now-stage__cover{position:absolute;inset:0;opacity:.7}
.now-stage{display:flex;height:100%;min-height:0;flex-direction:column}.now-stage__art{position:relative;min-height:180px;flex:1;display:grid;place-items:center;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:radial-gradient(circle at 48% 42%,rgba(215,192,143,.16),transparent 45%),var(--sr-color-surface-raised)}.now-stage__art>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.7}.now-stage__art>span{font-family:var(--sr-font-sans);font-size:54px;color:rgba(255,255,255,.2)}.now-stage__viz{position:absolute;inset:auto 14px 14px;width:calc(100% - 28px);height:52px}.now-stage__copy{display:flex;min-width:0;flex-direction:column;padding:18px 3px}.now-stage__copy>span{color:var(--sr-color-accent);font-size:11px;font-weight:800;letter-spacing:.18em}.now-stage__copy>strong,.now-stage__copy>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.now-stage__copy>strong{margin-top:6px;font-family:var(--sr-font-sans);font-size:22px;font-weight:500}.now-stage__copy>small{margin-top:3px;color:var(--sr-color-text-muted);font-size:12px}.now-stage__visualizer{display:grid;grid-template-columns:auto 1fr 1fr;align-items:center;gap:6px;padding-top:12px;border-top:1px solid var(--sr-color-line)}.now-stage__visualizer label{color:var(--sr-color-text-faint);font-size:12px}.now-stage select{min-width:0;padding:7px;border:1px solid var(--sr-color-line);border-radius:8px;background:var(--sr-color-surface-solid);color:var(--sr-color-text-muted);font-size:12px}
.now-stage__art{border-radius:var(--sr-radius-panel,20px);min-height:140px}.now-stage__copy>strong{font-size:20px}.now-stage__copy>small{font-size:12px}.now-stage__visualizer{grid-template-columns:1fr 1fr;gap:8px}.now-stage__visualizer label{grid-column:1/-1;font-size:12px}.now-stage select{min-height:44px;font-size:12px;border-radius:var(--sr-radius-control,12px)}
</style>
