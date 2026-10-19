<template>
  <article class="focus-card sr-glass">
    <h1>{{ status }}</h1>
    <div class="duration-grid">
      <button
        v-for="minutes in [25, 45, 60]"
        :key="minutes"
        class="duration-button"
        :class="{ active: selectedMinutes === minutes }"
        :aria-pressed="selectedMinutes === minutes"
        :disabled="timerState !== 'idle'"
        type="button"
        @click="$emit('set-duration', minutes)"
      >
        <strong>{{ minutes }}</strong>
        <small>分钟</small>
      </button>
    </div>

    <div class="custom-row">
      <span>自定义</span>
      <div class="minute-stepper sr-glass-control" :class="{ disabled: timerState !== 'idle' }">
        <button :disabled="timerState !== 'idle' || customMinutes <= 1" type="button" aria-label="减少一分钟" @click="stepMinutes(-1)"><AppIcon name="minus" /></button>
        <input v-model.number="customMinutes" :disabled="timerState !== 'idle'" type="number" min="1" max="180" aria-label="自定义专注分钟" />
        <button :disabled="timerState !== 'idle' || customMinutes >= 180" type="button" aria-label="增加一分钟" @click="stepMinutes(1)"><AppIcon name="plus" /></button>
      </div>
      <span>分钟</span>
      <button class="set-minutes" :disabled="timerState !== 'idle'" type="button" @click="$emit('set-duration', customMinutes)">设置</button>
    </div>

    <div class="timer">{{ formatCountdown(remainingSeconds) }}</div>
    <p>{{ copy }}</p>
    <div class="timer-actions">
      <button class="primary-action" type="button" :disabled="pending" @click="$emit('toggle')"><AppIcon :name="timerState === 'running' ? 'pause' : 'play'" /> {{ actionLabel.replace(/^[Ⅱ▶]\s*/, '') }}</button>
      <button v-if="timerState !== 'idle'" class="reset-action" type="button" aria-label="重置专注" @click="$emit('reset')"><AppIcon name="refresh" /></button>
    </div>
    <span v-if="error" class="inline-error" role="alert">{{ error }}</span>
  </article>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { clampFocusMinutes, formatCountdown } from "../../utils/focus";

const props = defineProps<{
  selectedMinutes: number;
  remainingSeconds: number;
  timerState: "idle" | "running" | "paused" | "completed";
  status: string;
  copy: string;
  actionLabel: string;
  pending: boolean;
  error?: string;
}>();

defineEmits<{
  "set-duration": [minutes: number];
  toggle: [];
  reset: [];
}>();

const customMinutes = ref(props.selectedMinutes);
watch(() => props.selectedMinutes, (minutes) => { customMinutes.value = minutes; });
function stepMinutes(delta: number) { customMinutes.value = clampFocusMinutes(Number(customMinutes.value) + delta); }
</script>

<style scoped>
.focus-card { padding:24px; border:1px solid var(--sr-color-line-strong); border-radius:var(--sr-radius-panel,20px); background:var(--sr-color-surface); backdrop-filter:blur(16px); box-shadow:0 16px 48px #04100930,inset 0 1px #ffffff0a; }
.focus-card h1 { margin:0 0 18px; font-size:20px; font-weight:600; }
.duration-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; padding:4px; border-radius:15px; background:rgba(15,20,18,.22); }
.duration-button { display:flex; align-items:baseline; justify-content:center; gap:4px; min-height:48px; padding:10px 4px; border:0; border-radius:11px; background:transparent; color:var(--sr-color-text-muted); cursor:pointer; transition:background 140ms ease,color 140ms ease; }.duration-button.active { background:var(--sr-color-selected,#bdd8bf30); color:var(--sr-color-text); box-shadow:inset 0 1px #ffffff12; }.duration-button strong { font-size:21px; font-weight:500; }.duration-button small { font-size:11px; }.duration-button:disabled { cursor:default; }
.custom-row { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:12px; color:var(--sr-color-text-muted); font-size:12px; }
.minute-stepper { display:grid; grid-template-columns:44px 44px 44px; align-items:center; min-height:44px; border:1px solid var(--sr-color-line); border-radius:12px; background:rgba(12,18,28,.32); overflow:hidden; }.minute-stepper input { width:44px; height:44px; padding:0; border:0; background:transparent; color:var(--sr-color-text); text-align:center; font:600 14px var(--sr-font-sans); appearance:textfield; }.minute-stepper input::-webkit-inner-spin-button { display:none; }.stepper-buttons { display:contents; }.stepper-buttons button { min-height:44px; padding:0; border:0; border-left:1px solid var(--sr-color-line); background:transparent; color:var(--sr-color-text); font-size:18px; cursor:pointer; }.minute-stepper.disabled { opacity:.5; }.set-minutes { margin-left:auto; min-height:44px; padding:8px 12px; border:1px solid var(--sr-color-line-strong); border-radius:12px; background:var(--sr-color-hover); color:var(--sr-color-text); font-size:12px; font-weight:600; cursor:pointer; }
.timer { margin-top:24px; font-size:clamp(56px,6.5vh,74px); font-weight:300; line-height:1; letter-spacing:-.045em; font-variant-numeric:tabular-nums; }.focus-card>p { margin:14px 0 20px; color:var(--sr-color-text-muted); font-size:13px; line-height:1.6; }.timer-actions { display:flex; gap:8px; }.primary-action { flex:1; min-height:48px; padding:10px 14px; border:0; border-radius:12px; background:var(--sr-color-accent); color:var(--sr-color-accent-ink); font-size:14px; font-weight:600; cursor:pointer; transition:opacity 140ms ease,transform 140ms var(--sr-ease-out); }.primary-action:active { transform:scale(.98); }.primary-action:disabled { opacity:.5; cursor:wait; }.reset-action { width:48px; min-height:48px; border:1px solid var(--sr-color-line-strong); border-radius:12px; background:var(--sr-color-hover); color:var(--sr-color-text); font-size:20px; cursor:pointer; }.inline-error { display:block; margin-top:12px; color:var(--sr-color-danger); font-size:12px; line-height:1.6; }
button:focus-visible,input:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:2px; }
.sr-reduced-transparency .focus-card,.sr-low-performance .focus-card { background:var(--sr-color-surface-solid); backdrop-filter:none; }
@media(hover:hover) and (pointer:fine) { .duration-button:hover:not(:disabled),.set-minutes:hover,.stepper-buttons button:hover:not(:disabled),.reset-action:hover { background:var(--sr-color-hover); }.primary-action:hover:not(:disabled) { opacity:.9; } }
@media(max-height:760px) and (min-width:801px) { .focus-card { padding:18px; }.focus-card h1 { margin-bottom:12px; }.timer { margin-top:16px; font-size:58px; }.focus-card>p { margin:10px 0 14px; } }
@media(prefers-reduced-motion:reduce) { .primary-action { transition:none; }.primary-action:active { transform:none; } }
.duration-button.active { background:var(--sr-color-accent); color:var(--sr-color-accent-ink); box-shadow:inset 0 1px #fff8,0 2px 8px #0002; }
.minute-stepper { grid-template-columns:44px 48px 44px; padding:2px; border-radius:999px; }
.minute-stepper input { width:48px; border-radius:8px; font-variant-numeric:tabular-nums; }
.minute-stepper button { display:grid; place-items:center; width:44px; height:44px; padding:0; border:0; border-radius:50%; background:transparent; color:var(--sr-color-text); cursor:pointer; transition:background-color 140ms ease; }
.minute-stepper button:disabled { opacity:.35; cursor:default; }
.minute-stepper button:focus-visible,.minute-stepper input:focus-visible { outline-offset:-3px; }
.minute-stepper button:not(:disabled):active { background:#ffffff24; }
@media(hover:hover) and (pointer:fine) { .minute-stepper button:not(:disabled):hover { background:var(--sr-color-hover); } }
</style>
