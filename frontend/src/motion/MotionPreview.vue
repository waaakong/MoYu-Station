<template>
  <main class="motion-preview">
    <header class="preview-toolbar">
      <div><strong>墨屿 · 动效预览</strong><small>下方为实际页面，点击导航体验切换。开屏与弹窗可随时重播。</small></div>
      <div class="preview-actions">
        <button type="button" @click="replayStartup">重播开屏</button>
        <button type="button" @click="center = true">居中弹窗</button>
        <button type="button" @click="right = true">侧栏</button>
        <button type="button" @click="shell.toast('提示消息会自然进入，点击可关闭。', 'success')">提示消息</button>
        <button type="button" :aria-pressed="reduced" @click="reduced = !reduced">减少动态：{{ reduced ? '开' : '关' }}</button>
      </div>
    </header>
    <iframe title="墨屿实际页面动效" src="/scene" />
    <OverlayDialog :open="center" label="居中动效预览" @close="center = false">
      <section class="preview-panel sr-glass sr-glass--floating">
        <header><div><small>MOTION STUDY</small><h2>一切，轻轻落下</h2></div><button type="button" aria-label="关闭居中预览" @click="center = false"><AppIcon name="close"/></button></header>
        <p>内容入场与遮罩同步。按 Escape 或点击外侧关闭，焦点会回到刚才的入口。</p>
        <label>菜单交互<AppSelect v-model="option"><option value="window">窗外的光</option><option value="water">湖面的涟漪</option><option value="forest">林间的风</option></AppSelect></label>
        <button type="button" class="preview-primary" @click="center = false">回到空间</button>
      </section>
    </OverlayDialog>
    <OverlayDialog :open="right" placement="right" label="侧栏动效预览" @close="right = false">
      <aside class="preview-panel preview-panel--right sr-glass sr-glass--floating">
        <header><div><small>YOUR QUIET SPACE</small><h2>留一点余地</h2></div><button type="button" aria-label="关闭侧栏预览" @click="right = false"><AppIcon name="close"/></button></header>
        <p>侧栏沿同一个方向进出，整个窗口的背景都会被遮罩覆盖。</p>
        <div class="preview-swatch" aria-hidden="true"><span></span><span></span><span></span></div>
        <label class="preview-switch"><span>减少动态预览</span><input type="checkbox" v-model="reduced"/></label>
        <p>本页仅用于确认动画，不会发布、安装客户端或修改账号资料。</p>
        <button type="button" class="preview-primary" @click="right = false">收起侧栏</button>
      </aside>
    </OverlayDialog>
    <ToastHost/>
  </main>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import OverlayDialog from '../components/controls/OverlayDialog.vue';
import ToastHost from '../components/states/ToastHost.vue';
import { useShellStore } from '../stores/shell';
import { attachStartupMotion } from '../startup/motion';
import { startInteractionMotion } from './interactions';
import { setMotionReduced } from './runtime';
const shell = useShellStore(), center = ref(false), right = ref(false), reduced = ref(false), option = ref('window');
let stopInteractions: (() => void) | undefined, stopStartup: (() => void) | undefined;
watch(reduced, value => { setMotionReduced(value); document.documentElement.classList.toggle('sr-reduced-motion',value); });
async function replayStartup() {
  if (window.moyuStartupOverlay?.active) return;
  stopStartup?.(); delete window.moyuStartupOverlay;
  const original = window.studyRoomDesktop;
  let shown = false;
  const bridge = { closeWindow: async () => window.moyuStartupOverlay?.dispose() } as typeof window.studyRoomDesktop;
  const restore = () => { if (window.studyRoomDesktop === bridge) window.studyRoomDesktop = original; };
  const cleanup = new MutationObserver(() => { if (shown && !document.getElementById('moyu-startup')) { cleanup.disconnect(); restore(); } });
  // Reuse the actual first-frame renderer in this development-only visual demo.
  window.studyRoomDesktop = bridge;
  cleanup.observe(document.body,{childList:true});
  try {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script'); script.src = `/startup-overlay.js?preview=${Date.now()}`;
      script.onload = () => { script.remove(); resolve(); }; script.onerror = () => { script.remove(); reject(new Error('preview load')); }; document.body.append(script);
    });
    const overlay = document.getElementById('moyu-startup');
    if (!overlay) throw new Error('preview surface missing');
    shown = true;
    if (overlay && reduced.value) overlay.dataset.static = 'true';
    stopStartup = attachStartupMotion();
    const surface = window.moyuStartupOverlay as import('../startup/runner').StartupSurface | undefined;
    surface?.ready();
    const status = overlay?.querySelector('.moyu-startup__status'); if (status) status.textContent = '开屏动效预览';
  } catch { cleanup.disconnect(); restore(); shell.toast('开屏预览未能加载，请刷新重试。','error'); }
}
onMounted(() => { stopInteractions = startInteractionMotion(); });
onBeforeUnmount(() => { stopInteractions?.(); stopStartup?.(); window.moyuStartupOverlay?.dispose(); });
</script>
<style scoped>
.motion-preview{height:100dvh;display:grid;grid-template-rows:auto minmax(0,1fr);background:#15201b}
.preview-toolbar{display:flex;gap:20px;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #ffffff20;background:#17201c;color:#eef2e9}
.preview-toolbar strong{font-size:15px;font-weight:600}.preview-toolbar small{display:block;margin-top:5px;font-size:11px;color:#b3beb5;line-height:1.6}
.preview-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
button{min-height:40px;border:1px solid #ffffff35;border-radius:999px;padding:8px 14px;background:#ffffff0a;color:inherit;cursor:pointer;font-size:12px}
button:hover{background:#ffffff18}button:focus-visible{outline:2px solid #d7e4d1;outline-offset:3px}
iframe{width:100%;height:100%;border:0;display:block}
.preview-panel{width:min(460px,100%);padding:28px;border:1px solid #ffffff30;border-radius:26px;color:#edf1e9;background:rgba(31,43,36,.92)}
.preview-panel header{display:flex;justify-content:space-between;align-items:center;gap:16px}.preview-panel header small{font-size:10px;letter-spacing:.16em;color:#b1c0b4}.preview-panel header button{display:grid;place-items:center;min-width:44px;height:44px;padding:0}
h2{margin:12px 0;font-size:28px;font-weight:500}p{font-size:13px;line-height:1.9;color:#c3cdc4}.preview-panel label{display:grid;gap:10px;margin:24px 0;font-size:12px}
.preview-primary{display:block;width:100%;margin-top:28px;background:#e6ecdf;color:#1b251f;font-size:13px;font-weight:600}
.preview-panel--right{width:min(420px,100%);height:100%;display:flex;flex-direction:column}.preview-panel--right .preview-primary{margin-top:auto}
.preview-swatch{display:grid;gap:12px;margin:24px 0}.preview-swatch span{height:64px;border:1px solid #ffffff22;border-radius:16px;background:linear-gradient(130deg,#a8b59b40,#3e594055)}
.preview-panel .preview-switch{display:flex;justify-content:space-between;align-items:center}.preview-switch input{width:20px;height:20px;accent-color:#d9e5ce}
@media(max-width:720px){.preview-toolbar{align-items:flex-start;flex-direction:column;gap:12px;padding:12px}.preview-actions{justify-content:flex-start;gap:6px}.preview-actions button{font-size:11px;padding:7px 10px}.preview-toolbar small{display:none}.preview-panel{padding:22px}}
</style>
