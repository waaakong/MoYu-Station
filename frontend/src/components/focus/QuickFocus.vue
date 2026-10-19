<template>
  <section class="quick-focus sr-glass" :class="{ 'quick-focus--active': Boolean(focus.session) }" aria-label="空间快捷专注">
    <div class="quick-focus__summary"><span>此刻专注</span><strong>{{ display }}</strong></div>
    <label v-if="!focus.session" class="quick-focus__duration"><span>分钟</span><AppSelect v-model.number="minutes" :disabled="pending"><option v-for="value in [15,25,45,60]" :key="value" :value="value">{{ value }}</option></AppSelect></label>
    <button class="quick-focus__action" type="button" :disabled="pending" @click="toggle">{{ focus.timerState==='running'?'暂停':focus.timerState==='paused'?'继续':'开始专注' }}</button>
    <RouterLink class="quick-focus__details" :to="{name:'focus'}">详细专注<AppIcon name="chevronRight" /></RouterLink>
    <p v-if="error || focus.persistenceError" role="alert">{{ error || '本地记录保存失败，请到详细专注页处理。' }}</p>
  </section>
</template>
<script setup lang="ts">
import {computed,ref} from 'vue';
import {useFocusStore} from '../../stores/focus';
import {useSceneStore} from '../../stores/scene';
import {useAuthStore} from '../../stores/auth';
const focus=useFocusStore(),scene=useSceneStore(),auth=useAuthStore();
const minutes=ref(25),pending=ref(false),error=ref('');
const display=computed(()=>{const seconds=focus.session?focus.snapshot.remainingSeconds:minutes.value*60;return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;});
async function toggle(){if(pending.value)return;pending.value=true;error.value='';try{
  if(focus.timerState==='running')focus.pause();else if(focus.timerState==='paused')focus.resume();else{
    const session=await focus.start({plannedMinutes:minutes.value,sceneCode:scene.sceneKey,timeKey:scene.timeKey,accountScope:auth.user?.id?String(auth.user.id):undefined});scene.beginFocusSession(session.clientRecordId);
  }
}catch(cause){error.value=cause instanceof Error?cause.message:'暂时无法开始专注';}finally{pending.value=false;}}
</script>
<style scoped>
.quick-focus { display:grid; grid-template-columns:minmax(100px,1fr) auto auto; align-items:center; gap:12px; margin-top:24px; padding:16px; max-width:480px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-panel,20px); background:var(--sr-color-surface); backdrop-filter:blur(12px); text-shadow:none; box-shadow:inset 0 1px #ffffff08; }
.quick-focus>div { display:grid; gap:6px; }.quick-focus span { font-size:12px; color:var(--sr-color-text-muted); }.quick-focus strong { font:500 30px/1.1 var(--sr-font-sans); font-variant-numeric:tabular-nums; letter-spacing:-.04em; }
button,select,a { min-height:44px; border:1px solid var(--sr-color-line-strong); border-radius:var(--sr-radius-control,12px); padding:9px 12px; background:#ffffff0a; color:var(--sr-color-text); font:600 12px/1.4 var(--sr-font-sans); text-decoration:none; box-sizing:border-box; white-space:nowrap; }
button { background:var(--sr-color-accent); color:var(--sr-color-accent-ink); cursor:pointer; transition:opacity 140ms ease,transform 140ms var(--sr-ease-out); }button:active { transform:scale(.98); }button:disabled { opacity:.5; cursor:wait; }a { grid-column:1/-1; min-height:32px; display:grid; place-items:center; border:0; padding:4px 8px; background:transparent; color:var(--sr-color-text-muted); }label { display:grid; gap:3px; font-size:11px; color:var(--sr-color-text-muted); }select { min-height:36px; padding:6px; }option { color:var(--sr-color-text); background:var(--sr-color-surface-solid); }p { grid-column:1/-1; font-size:12px; color:#ffd5b5; margin:0; line-height:1.6; }
button:focus-visible,select:focus-visible,a:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:3px; }
.sr-reduced-transparency .quick-focus { background:var(--sr-color-surface-solid); backdrop-filter:none; }
@media(hover:hover) and (pointer:fine) { button:hover:not(:disabled),a:hover { opacity:.85; } }
@media(max-width:420px) { .quick-focus { gap:8px; padding:12px; }.quick-focus strong { font-size:28px; }button { padding-inline:10px; } }
@media(prefers-reduced-motion:reduce) { button { transition:none; }button:active { transform:none; } }
.quick-focus { grid-template-columns:minmax(90px,1fr) 72px auto; align-items:end; gap:10px 14px; padding:18px 18px 12px; }
.quick-focus__summary,.quick-focus__duration { display:grid; gap:6px; align-self:start; }
.quick-focus__summary>span,.quick-focus__duration>span:first-child { font-size:12px; line-height:16px; }
.quick-focus__summary strong { display:flex; align-items:center; min-height:44px; }
.quick-focus__action { min-height:44px; align-self:end; }
.quick-focus__details { display:flex; align-items:center; justify-content:flex-end; gap:4px; justify-self:end; padding:4px 0 4px 8px; }
.quick-focus__details :deep(svg) { width:14px; height:14px; }
.quick-focus--active { grid-template-columns:minmax(90px,1fr) auto; }
@media(max-width:420px) { .quick-focus { gap:8px 10px; padding:16px 14px 10px; } }
</style>
