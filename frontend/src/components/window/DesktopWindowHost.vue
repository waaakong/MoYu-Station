<template>
  <dialog ref="dialog" class="close-dialog sr-glass sr-glass--floating" aria-labelledby="close-title" aria-describedby="close-description" @cancel.prevent="cancel">
    <form @submit.prevent="submit">
      <header><span class="eyebrow">墨屿 · 窗口</span><h2 id="close-title">{{ preparing ? '退出程序' : '关闭窗口' }}</h2></header>
      <p id="close-description">{{ preparing ? (volatileWork ? '还有未发送内容或未确认任务。退出会丢失内存草稿，未确认结果不会自动重试。' : '正在检查本机保存状态…') : '选择关闭后的行为，音乐与专注由你决定。' }}</p>
      <fieldset v-if="!preparing" :disabled="busy">
        <legend class="sr-only">关闭方式</legend>
        <label class="close-choice" :class="{ selected: action === 'tray' }">
          <input v-model="action" type="radio" value="tray" name="close-action" :disabled="!state.snapshot?.trayAvailable" />
          <span><strong>隐藏到托盘</strong><small>继续播放音乐与专注，双击托盘图标恢复。</small></span>
        </label>
        <label class="close-choice" :class="{ selected: action === 'quit' }">
          <input v-model="action" type="radio" value="quit" name="close-action" />
          <span><strong>退出程序</strong><small>停止播放、暂停专注；未发布内容不会自动发送。</small></span>
        </label>
        <label class="remember"><input v-model="remember" type="checkbox" />不再提示<span>可在“外观与性能”中修改</span></label>
      </fieldset>
      <p v-if="error || state.snapshot?.error" class="close-error" role="alert">{{ error || state.snapshot?.error }}</p>
      <p v-if="!state.snapshot?.trayAvailable && !preparing" class="close-error">托盘当前不可用，窗口不会被隐藏。</p>
      <footer>
        <button type="button" :disabled="busy" @click="cancel">取消</button>
        <button v-if="!preparing || volatileWork" class="primary" type="submit" :disabled="busy">{{ busy ? '正在处理…' : preparing ? '仍然退出' : '确定' }}</button>
      </footer>
    </form>
  </dialog>
</template>
<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDesktopWindowStore } from "../../stores/desktopWindow";
import { hasVolatileWork, prepareLocalQuit } from "../../window/quitPreparation";
const state = useDesktopWindowStore();
const dialog = ref<HTMLDialogElement>();
const action = ref<"tray" | "quit">("tray"), remember = ref(false), busy = ref(false), error = ref("");
const volatileWork = ref(false);
const preparing = computed(() => state.snapshot?.closeRequest?.phase === "prepare");
let stop: (() => void) | undefined, previousFocus: HTMLElement | null = null;
let alive = true;
watch(() => state.snapshot?.closeRequest?.id, async (id) => {
  if (!id) { closeMotionDialog(dialog.value, true); previousFocus?.isConnected && previousFocus.focus(); return; }
  if (!state.snapshot?.error) error.value = "";
  busy.value = false; remember.value = false;
  action.value = state.snapshot?.trayAvailable ? "tray" : "quit";
  volatileWork.value = hasVolatileWork();
  await nextTick();
  if (!alive || state.snapshot?.closeRequest?.id !== id) return;
  if (!dialog.value?.open) { previousFocus = document.activeElement as HTMLElement; openMotionDialog(dialog.value); }
  if (preparing.value) {
    if (!volatileWork.value) void finish(id);
    else void window.studyRoomDesktop?.completeWindowQuit({ id, ready: "waiting" }).catch(() => { error.value = "退出请求已变化，请取消后重试。"; });
  }
}, { immediate: true });
async function cancel() {
  const id = state.snapshot?.closeRequest?.id;
  if (!id || busy.value) return;
  try { await window.studyRoomDesktop?.resolveWindowClose({ id, action: "cancel", remember: false }); }
  catch { error.value = "取消未完成，请重试。"; }
}
async function finish(id: string) {
  busy.value = true;
  try {
    await window.studyRoomDesktop?.completeWindowQuit({ id, ready: "working" });
    await prepareLocalQuit();
    if (state.snapshot?.closeRequest?.id === id) await window.studyRoomDesktop?.completeWindowQuit({ id, ready: true });
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "本机保存未完成。";
    if (state.snapshot?.closeRequest?.id === id) {
      try { await window.studyRoomDesktop?.completeWindowQuit({ id, ready: false }); }
      catch { /* Keep the window and error visible; main-process timeout also fails closed. */ }
    }
  } finally { busy.value = false; }
}
async function submit() {
  const id = state.snapshot?.closeRequest?.id;
  if (!id || busy.value) return;
  if (preparing.value) { await finish(id); return; }
  busy.value = true; error.value = "";
  try { await window.studyRoomDesktop?.resolveWindowClose({ id, action: action.value, remember: remember.value }); }
  catch { error.value = "操作未完成。若偏好保存失败，可取消勾选“不再提示”后重试本次操作。"; }
  finally { busy.value = false; }
}
onMounted(() => {
  const bridge = window.studyRoomDesktop;
  if (!bridge?.onWindowState) return;
  stop = bridge.onWindowState(value => state.accept(value));
  void state.refresh().catch(() => { state.error = "窗口状态读取失败，请重试。"; });
});
onBeforeUnmount(() => { alive = false; stop?.(); closeMotionDialog(dialog.value, true); });
</script>
<style scoped>
.close-dialog{box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;border:1px solid #ffffff23;border-radius:22px;padding:28px;background:var(--sr-color-surface-solid);color:var(--sr-color-text);box-shadow:0 28px 80px #0007;color-scheme:dark;-webkit-app-region:no-drag}
.close-dialog::backdrop{background:rgba(7,12,20,.6)}
.eyebrow{font-size:11px;letter-spacing:.14em;color:var(--sr-color-text-muted)}h2{font-size:25px;font-weight:600;letter-spacing:-.03em;margin:10px 0 12px}
p{font-size:13px;line-height:1.7;color:var(--sr-color-text-muted);margin:0 0 20px}fieldset{border:0;padding:0;margin:0}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.close-choice{display:flex;align-items:center;gap:14px;padding:16px;border:1px solid #ffffff20;border-radius:13px;margin-top:10px;cursor:pointer;background:#ffffff04}
.close-choice.selected{border-color:var(--sr-color-focus);background:var(--sr-color-selected)}.close-choice span{display:grid;gap:6px}.close-choice strong{font-size:14px;font-weight:600}.close-choice small{font-size:12px;line-height:1.5;color:var(--sr-color-text-muted)}
input{accent-color:var(--sr-color-accent);width:17px;height:17px;flex:none}.remember{display:flex;align-items:center;gap:8px;margin:20px 0;font-size:13px;flex-wrap:wrap}.remember span{font-size:11px;color:var(--sr-color-text-muted)}
footer{display:flex;gap:10px;justify-content:flex-end;margin-top:24px}button{min-width:92px;min-height:44px;padding:10px 18px;border:1px solid #ffffff26;border-radius:11px;background:transparent;color:inherit;font:inherit;font-size:13px;cursor:pointer;transition:transform 120ms cubic-bezier(.23,1,.32,1),background-color 140ms ease}
button.primary{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent}button:active{transform:scale(.98)}button:disabled{opacity:.55;cursor:wait}button:focus-visible,input:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}
.close-error{color:#f5b6a9;margin-top:16px;margin-bottom:0}
@media(hover:hover){button:not(:disabled):hover{filter:brightness(1.08)}}
@media(prefers-reduced-motion:reduce){button{transition:none;transform:none}}
.sr-reduced-motion button{transition:none;transform:none}
</style>
