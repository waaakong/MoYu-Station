<template>
  <section class="wood-tool" :class="{ quiet: reducedMotion }">
    <div class="wood-stage">
      <button ref="fishButton" class="wood-fish" type="button" :disabled="paused" aria-label="敲击电子木鱼" @click="hit" @keydown.space.prevent="keyHit" @keyup.space.prevent>
        <!-- Reuses the user-approved v2 prototype artwork; no third-party asset. -->
        <svg class="muyu-art" viewBox="0 0 440 330" aria-hidden="true" focusable="false">
          <ellipse cx="211" cy="293" rx="136" ry="13" fill="#05100c" opacity=".3" />
          <g class="muyu-body">
            <path d="M69 213C56 155 81 104 132 77C187 48 253 56 293 88C310 101 322 116 326 133C338 125 354 128 365 138C381 153 376 176 359 187C351 192 341 193 330 191C313 233 279 261 234 272C185 285 116 276 87 250C79 241 72 228 69 213Z" fill="#e4dfca" />
            <path d="M89 141C131 93 203 83 260 107C280 115 297 128 308 143" fill="none" stroke="#b0aa93" stroke-width="7" stroke-linecap="round" opacity=".65" />
            <path d="M86 184C117 155 171 140 215 144C251 147 278 163 309 170C323 174 340 172 343 163C345 158 341 153 335 152" fill="none" stroke="#14251e" stroke-width="18" stroke-linecap="round" />
            <path d="M87 196C130 165 180 159 218 166M114 224C145 247 202 253 242 239" fill="none" stroke="#b0aa93" stroke-width="4" stroke-linecap="round" opacity=".6" />
            <path d="M286 211C298 198 305 187 309 178" fill="none" stroke="#14251e" stroke-width="7" stroke-linecap="round" />
          </g>
          <g class="muyu-mallet">
            <path d="M326 62L414 116" fill="none" stroke="#15241c" stroke-width="20" stroke-linecap="round" />
            <path d="M326 62L414 116" fill="none" stroke="#d6cfb5" stroke-width="13" stroke-linecap="round" />
            <path d="M332 65L405 110" fill="none" stroke="#f2efdf" stroke-width="3" stroke-linecap="round" opacity=".5" />
            <ellipse cx="311" cy="52" rx="37" ry="25" transform="rotate(32 311 52)" fill="#f2efdf" stroke="#b0aa93" stroke-width="2" />
            <path d="M292 33C292 48 310 65 330 69" fill="none" stroke="#b0aa93" stroke-width="3" stroke-linecap="round" opacity=".6" />
          </g>
        </svg>
      </button>
      <p>点击木鱼，或聚焦后按空格键</p>
    </div>
    <div class="wood-controls">
      <h2>电子木鱼</h2><strong>{{ store.woodenFish.count.toLocaleString() }}</strong><span>本机累计</span>
      <div class="tempo" aria-label="自动节奏">
        <button v-for="item in tempos" :key="item.id" type="button" :class="{ active: store.woodenFish.tempo === item.id, 'sr-glass-control': store.woodenFish.tempo === item.id }" :aria-pressed="store.woodenFish.tempo === item.id" @click="store.setWoodenFishTempo(item.id)">{{ item.label }}</button>
      </div>
      <div class="actions"><button class="primary" type="button" :disabled="paused || confirmReset" @click="toggleAuto">{{ automatic ? '停止自动节奏' : '开始自动节奏' }}</button><button class="sr-glass-control" type="button" @click="openReset">归零</button></div>
      <p v-if="paused">窗口离开后自动节奏不会自行恢复。</p>
      <div v-if="confirmReset" class="confirm"><span>确认清空本机累计次数？</span><button class="sr-glass-control" type="button" @click="reset">确认</button><button class="sr-glass-control" type="button" @click="confirmReset = false">取消</button></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { EntertainmentTempo } from "@studyroom/contracts";
import { WOODEN_FISH_INTERVALS } from "../../entertainment/runtime";
import { entertainmentAudio } from "../../entertainment/audioController";
import { useEntertainmentStore } from "../../stores/entertainment";
const props = defineProps<{ paused: boolean; reducedMotion: boolean }>();
const store = useEntertainmentStore();
const automatic = ref(false);
const confirmReset = ref(false);
const fishButton = ref<HTMLButtonElement>();
let hitAnimation: Animation | undefined;
const tempos: Array<{ id: EntertainmentTempo; label: string }> = [{ id: "slow", label: "慢" }, { id: "medium", label: "中" }, { id: "fast", label: "快" }];
let timer = 0;
function hit(event?: Event) { if (props.paused || confirmReset.value) return; store.hitWoodenFish(); void entertainmentAudio.play("wood"); if(props.reducedMotion || event instanceof KeyboardEvent || event instanceof MouseEvent && event.detail===0)return;hitAnimation?.cancel();hitAnimation=fishButton.value?.querySelector('.muyu-mallet')?.animate([{transform:'rotate(0deg)'},{transform:'rotate(-22deg)',offset:.35},{transform:'rotate(0deg)'}],{duration:230,easing:'cubic-bezier(.23,1,.32,1)'}); }
function keyHit(event:KeyboardEvent){if(!event.repeat)hit(event);}
function openReset(){stopAuto();confirmReset.value=true;}
function stopAuto() { automatic.value = false; window.clearInterval(timer); }
function startAuto() { if (props.paused) return; stopAuto(); automatic.value = true; timer = window.setInterval(hit, WOODEN_FISH_INTERVALS[store.woodenFish.tempo]); }
function toggleAuto() { if (automatic.value) stopAuto(); else startAuto(); }
function reset() { stopAuto(); store.resetWoodenFish(); confirmReset.value = false; }
watch(() => store.woodenFish.tempo, () => { if (automatic.value) startAuto(); });
watch(() => props.paused, (paused) => { if (paused) stopAuto(); });
watch(() => props.reducedMotion, value => { if(value)hitAnimation?.cancel(); });
onBeforeUnmount(()=>{stopAuto();hitAnimation?.cancel();});
</script>

<style scoped>
.wood-tool{display:grid;grid-template-columns:1.1fr .9fr;align-items:center;gap:60px;height:100%;padding:clamp(30px,5vw,74px);outline:none}.wood-stage{display:grid;place-items:center;gap:20px}.wood-stage p,.wood-controls>p{color:rgba(255,255,255,.58)}.wood-fish{position:relative;width:min(38vw,470px);aspect-ratio:1.55;border:1px solid rgba(255,255,255,.18);border-radius:52% 52% 44% 44%;background:radial-gradient(circle at 50% 32%,#7b5537 0,#4c3022 52%,#291c17 100%);box-shadow:inset 0 12px 32px rgba(255,255,255,.12),inset 0 -24px 50px rgba(0,0,0,.34),0 40px 90px rgba(0,0,0,.3);color:#eadbc4;cursor:pointer;transition:transform 100ms ease}.wood-fish:active{transform:scale(.975)}.wood-fish span{position:absolute;left:18%;right:18%;top:45%;height:12%;border-radius:999px;background:#17100d;box-shadow:inset 0 4px 7px #000}.wood-fish i{position:relative;z-index:1;font:400 48px var(--sr-font-display)}.wood-controls{display:grid;align-content:center;gap:12px}.wood-controls h2{margin:0;font:500 46px var(--sr-font-display)}.wood-controls>strong{font:500 76px/1 var(--sr-font-display)}.wood-controls>span{color:rgba(255,255,255,.5);font-size:12px}.tempo,.actions,.confirm{display:flex;align-items:center;gap:9px;margin-top:12px}.tempo button,.actions button,.confirm button{height:40px;padding:0 18px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(255,255,255,.08);color:#fff;font:800 13px var(--sr-font-sans);cursor:pointer}.tempo button.active,.actions .primary{background:#f1f3ee;color:#202521}.confirm{flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:rgba(0,0,0,.2)}.confirm span{flex-basis:100%;color:rgba(255,255,255,.76);font-size:13px}@media(max-width:1000px){.wood-tool{grid-template-columns:1fr;gap:18px;overflow:auto}.wood-fish{width:320px}.wood-controls{text-align:center}.tempo,.actions,.confirm{justify-content:center}}
.wood-tool{gap:clamp(20px,4vw,60px);padding:clamp(16px,3vw,40px);min-height:0;box-sizing:border-box;overflow:auto}.wood-fish{width:min(100%,410px);aspect-ratio:440/330;border:0;border-radius:var(--sr-radius-panel,20px);padding:0;background:none;box-shadow:none;transform:none!important}.wood-fish:disabled{opacity:.45;cursor:default}.muyu-art{display:block;width:100%;height:100%;overflow:visible;pointer-events:none}.muyu-mallet{transform-origin:408px 111px}.wood-controls h2{font-size:32px}.wood-controls>strong{font-family:var(--sr-font-sans);font-size:64px;font-weight:550;font-variant-numeric:tabular-nums}.wood-stage p,.wood-controls>p,.wood-controls>span{color:var(--sr-color-text-muted);font-size:12px;line-height:1.7}.tempo{padding:4px;border:1px solid var(--sr-color-line);border-radius:16px;background:#09120f55;width:fit-content}.tempo button,.actions button,.confirm button{min-height:44px;height:44px;border-radius:var(--sr-radius-control,12px);font-weight:600;white-space:nowrap}.tempo button{border:0;min-width:62px;background:transparent}.tempo button.active{background:#dce7d2;color:#1e2c22}.actions{flex-wrap:wrap}.actions button:disabled{opacity:.45;cursor:not-allowed}.wood-tool button:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:4px}.quiet .muyu-mallet{animation:none!important;transform:none!important}
@media(max-width:1000px){.wood-tool{grid-template-columns:1fr;gap:10px;align-content:start}.wood-fish{width:min(100%,300px)}.wood-controls{gap:8px}.wood-controls h2{font-size:26px}.wood-controls>strong{font-size:46px}.wood-stage{gap:4px}.wood-stage p{margin:0}.tempo{margin-inline:auto}.wood-controls>p{margin-block:0}.tempo,.actions{margin-top:6px}}
.tempo{background:rgba(10,15,23,.26);box-shadow:inset 0 1px 3px rgba(0,0,0,.16)}
.tempo button.active{color:var(--sr-color-text)}
.actions .primary{background:var(--sr-color-accent);color:var(--sr-color-accent-ink)}
.confirm{background:var(--sr-color-surface-raised);box-shadow:inset 0 1px 0 rgba(255,255,255,.14)}.confirm span{color:var(--sr-color-text)}
</style>
