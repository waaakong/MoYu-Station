<template>
  <section class="breathing-tool" :class="{ quiet: reducedMotion }">
    <div class="breath-stage" :data-phase="snapshot.phase">
      <div class="breath-ring" :style="{transform:reducedMotion?'none':`scale(${breathScale})`}"><span>{{ phaseLabel }}</span><strong>{{ Math.ceil(snapshot.remainingMs / 1000) }}</strong><small>秒</small></div>
    </div>
    <div class="tool-copy">
      <h2>一分钟呼吸</h2>
      <p>吸气 4 秒，停留 2 秒，呼气 6 秒。只跟着此刻的节奏就好。</p>
      <div class="progress" role="progressbar" aria-label="呼吸练习进度" :aria-valuenow="Math.round(snapshot.progress*100)" aria-valuemin="0" aria-valuemax="100"><i :style="{ transform: `scaleX(${snapshot.progress})` }"></i></div>
      <p v-if="paused" class="pause-note">窗口暂时离开，呼吸引导已暂停。</p>
      <div class="actions">
        <button v-if="!running" class="primary" type="button" :disabled="paused" @click="start">{{ snapshot.phase === 'complete' ? '再来一分钟' : snapshot.elapsedMs ? '继续' : '开始' }}</button>
        <button v-else class="sr-glass-control" type="button" @click="stop">暂停</button>
        <button class="sr-glass-control" type="button" @click="reset">重新开始</button>
      </div>
      <small>已完成 {{ store.breathing.completedRounds }} 轮，仅保存在本机</small>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { breathingSnapshot, BREATHING_TOTAL_MS } from "../../entertainment/runtime";
import { entertainmentAudio } from "../../entertainment/audioController";
import { useEntertainmentStore } from "../../stores/entertainment";

const props = defineProps<{ paused: boolean; reducedMotion: boolean }>();
const store = useEntertainmentStore();
const running = ref(false);
const elapsed = ref(store.breathing.elapsedMs);
const snapshot = computed(() => breathingSnapshot(elapsed.value));
const breathScale = computed(() => {
  const position = elapsed.value % 12000;
  if (elapsed.value >= BREATHING_TOTAL_MS) return .88;
  if (position < 4000) return .88 + .12 * position / 4000;
  return position < 6000 ? 1 : 1 - .12 * (position - 6000) / 6000;
});
const phaseLabel = computed(() => ({ inhale: "吸气", hold: "停留", exhale: "呼气", complete: "完成" })[snapshot.value.phase]);
let timer = 0;
let startedAt = 0;
let baseElapsed = 0;
let previousPhase = snapshot.value.phase;

function tick() {
  elapsed.value = Math.min(BREATHING_TOTAL_MS, baseElapsed + Date.now() - startedAt);
  const current = breathingSnapshot(elapsed.value);
  if (current.phase !== previousPhase) { previousPhase = current.phase; void entertainmentAudio.play(current.phase === "complete" ? "success" : "tap"); }
  if (elapsed.value >= BREATHING_TOTAL_MS) {
    running.value = false;
    window.clearInterval(timer);
    store.updateBreathing(BREATHING_TOTAL_MS, true);
  } else store.updateBreathing(elapsed.value);
}
function start() {
  if (props.paused) return;
  if (elapsed.value >= BREATHING_TOTAL_MS) reset();
  baseElapsed = elapsed.value;
  startedAt = Date.now();
  running.value = true;
  window.clearInterval(timer);
  timer = window.setInterval(tick, 100);
}
function stop() { if (!running.value) return; tick(); running.value = false; window.clearInterval(timer); }
function reset() { running.value = false; window.clearInterval(timer); elapsed.value = 0; previousPhase = "inhale"; store.resetBreathing(); }
watch(() => props.paused, (paused) => { if (paused) stop(); });
onBeforeUnmount(() => { stop(); window.clearInterval(timer); });
</script>

<style scoped>
.breathing-tool{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(320px,1.1fr);align-items:center;gap:clamp(34px,6vw,92px);height:100%;padding:clamp(26px,4vw,60px)}.breath-stage{display:grid;place-items:center;min-height:360px}.breath-ring{display:grid;place-items:center;width:min(27vw,320px);aspect-ratio:1;border:1px solid rgba(255,255,255,.5);border-radius:50%;background:radial-gradient(circle,rgba(205,232,218,.32),rgba(54,77,68,.16) 55%,rgba(255,255,255,.02));box-shadow:0 0 0 28px rgba(255,255,255,.035),0 30px 80px rgba(0,0,0,.24);animation:breathe-scale 12s ease-in-out infinite}.breath-stage[data-phase=hold] .breath-ring{animation-play-state:paused}.breath-stage[data-phase=exhale] .breath-ring{animation-direction:reverse}.breath-stage[data-phase=complete] .breath-ring{animation:none}.breath-ring span{align-self:end;color:rgba(255,255,255,.78);font-size:16px;font-weight:800}.breath-ring strong{font-family:var(--sr-font-display);font-size:78px;font-weight:500;line-height:1}.breath-ring small{align-self:start;color:rgba(255,255,255,.55)}.tool-copy{display:grid;gap:16px}.tool-copy h2{margin:0;font:500 clamp(34px,4vw,58px)/1.1 var(--sr-font-display)}.tool-copy p{max-width:540px;margin:0;color:rgba(255,255,255,.7);line-height:1.8}.progress{height:4px;overflow:hidden;border-radius:9px;background:rgba(255,255,255,.12)}.progress i{display:block;height:100%;border-radius:inherit;background:#dce9df;transition:width 100ms linear}.actions{display:flex;gap:10px}.actions button{min-width:108px;height:42px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.08);color:#fff;font:800 13px var(--sr-font-sans);cursor:pointer}.actions .primary{background:#f1f3ee;color:#202521}.actions button:disabled{opacity:.45;cursor:not-allowed}.tool-copy>small{color:rgba(255,255,255,.5)}.pause-note{color:#ead6a8!important}.quiet .breath-ring{animation:none}.quiet .progress i{transition:none}@keyframes breathe-scale{0%,100%{transform:scale(.88)}33%{transform:scale(1)}50%{transform:scale(1)} }@media(max-width:1000px){.breathing-tool{grid-template-columns:1fr;gap:18px;overflow:auto}.breath-stage{min-height:260px}.breath-ring{width:230px}.tool-copy h2{font-size:36px}}
.breathing-tool{grid-template-columns:minmax(220px,.9fr) minmax(260px,1.1fr);padding:clamp(16px,3vw,40px);gap:clamp(24px,5vw,72px);box-sizing:border-box;min-height:0;overflow:auto}.breath-stage{min-height:280px}.breath-ring{animation:none!important;transition:transform 100ms linear;width:min(26vw,280px)}.breath-ring strong{font-family:var(--sr-font-sans);font-variant-numeric:tabular-nums;font-size:64px}.tool-copy h2{font-size:clamp(28px,3vw,42px)}.tool-copy p,.tool-copy>small{color:var(--sr-color-text-muted)}.progress i{width:100%;transform-origin:left center;transition:transform 100ms linear}.actions button{height:44px;border-radius:var(--sr-radius-control,12px);font-weight:600}.quiet .breath-ring{transition:none}.actions button:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}
@media(max-width:760px){.breathing-tool{grid-template-columns:1fr;gap:16px;padding:16px;align-content:start}.breath-stage{min-height:230px}.breath-ring{width:200px}.tool-copy{gap:12px}.tool-copy h2{font-size:28px}.tool-copy p{font-size:13px}}
.breath-ring{border-color:var(--sr-material-edge);background:radial-gradient(circle at 38% 26%,rgba(242,248,255,.24),rgba(200,218,239,.08) 58%,rgba(255,255,255,.02));box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 0 0 28px rgba(236,243,255,.035),0 30px 80px rgba(4,10,22,.24)}
.breath-ring span,.breath-ring small{color:var(--sr-color-text-muted)}
.progress{background:var(--sr-color-line)}.progress i{background:var(--sr-color-accent)}
.actions .primary{background:var(--sr-color-accent);color:var(--sr-color-accent-ink)}
</style>
