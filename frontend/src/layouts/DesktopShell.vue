<template>
  <div
    class="desktop-shell"
    :data-route="route.name"
    :class="{
      'desktop-shell--compact': shell.preferences.compact,
      'desktop-shell--immersive': shell.immersive,
      'desktop-shell--listening':shell.listeningStage,
      'sr-reduced-motion': shell.motionReduced,
      'sr-reduced-transparency': shell.transparencyReduced,
      'sr-low-performance': shell.preferences.lowPerformance
      ,'desktop-shell--native': isDesktop
    }"
  >
    <div class="desktop-shell__backdrop" aria-hidden="true">
      <SceneBackground v-if="!solidBackdrop" />
      <div class="desktop-shell__shade" />
    </div>
    <a class="desktop-shell__skip" href="#main-stage">跳到主要内容</a>
    <AppTitlebar v-if="isDesktop && (shell.immersive||shell.listeningStage)" floating />
    <AppRail v-show="!shell.immersive&&!shell.listeningStage"
      ref="rail"
      :drawer-open="shell.drawer !== null"
      @open-drawer="openAppearance"
    />

    <main id="main-stage" class="desktop-shell__stage" tabindex="-1">
      <slot />
    </main>

    <div v-show="route.name !== 'focus' && !shell.immersive&&!shell.listeningStage" class="desktop-shell__player-slot"><PersistentPlayer /></div>
    <ContextDrawerHost :open="shell.drawer === 'appearance'" @close="closeDrawer" @closed="restoreDrawerFocus" />
    <ToastHost />

    <dialog
      ref="manualUpdateDialog"
      v-if="isDesktop"
      class="manual-update-dialog sr-glass sr-glass--floating"
      aria-labelledby="manual-update-title"
      aria-describedby="manual-update-description"
      @cancel.prevent="dismissManualUpdate"
    >
      <p class="manual-update-dialog__eyebrow">MOYU DESKTOP</p>
      <h2 id="manual-update-title">发现新版本</h2>
      <p id="manual-update-description">
        当前版本 {{ updates.status.currentVersion }} · 最新版本 {{ updates.status.availableVersion }}。
        {{ updates.status.state === 'manual-update-available' ? '前往下载页查看更新说明并手动下载安装。' : '可先查看更新说明，再决定下载；不会自动安装或打断当前工作。' }}
      </p>
      <p class="manual-update-dialog__note">{{ updates.status.state === 'manual-update-available' ? '客户端不会自动下载或安装；下载页会显示当前安装包的版本与校验值。' : updates.status.oneClickEnabled ? '点击“更新并重启”授权本次完整更新；忙碌时等待，重启前可取消。Windows 安全提示仍需你确认。' : '下载后仍需确认安装；安装前会保存本机数据，并复核版本与权限。' }}</p>
      <div class="manual-update-dialog__actions">
        <button type="button" class="manual-update-dialog__primary" @click="openUpdateAction">{{ updates.status.state === 'manual-update-available' ? '前往下载页' : '查看更新' }}</button>
        <button type="button" @click="dismissManualUpdate">稍后</button>
      </div>
    </dialog>

    <button
      v-if="showUpdateNotice"
      class="desktop-shell__update-notice"
      type="button"
      @click="openClientVersion"
    >
      <span>{{ updates.status.mandatory ? "需要更新" : "客户端更新" }}</span>
      <strong>{{ updates.status.availableVersion || "已准备" }}</strong>
    </button>

    <button
      v-if="shell.immersive"
      ref="leaveImmersive"
      class="desktop-shell__leave-immersive"
      type="button"
      @click="leaveImmersiveMode"
    >
      退出沉浸模式
    </button>
  </div>
</template>

<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../motion/runtime';
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppRail from "../components/navigation/AppRail.vue";
import AppTitlebar from "../components/window/AppTitlebar.vue";
import ContextDrawerHost from "../components/drawers/ContextDrawerHost.vue";
import PersistentPlayer from "../components/player/PersistentPlayer.vue";
import ToastHost from "../components/states/ToastHost.vue";
import { useShellStore } from "../stores/shell";
import { useUpdatesStore } from "../stores/updates";
import { useAuthStore } from '../stores/auth';
import { useEntertainmentStore } from "../stores/entertainment";
import SceneBackground from "../components/scenes/SceneBackground.vue";
import { shellBackdropKey } from "../components/scenes/shellBackdrop";

const shell = useShellStore();
const route = useRoute();
const entertainment = useEntertainmentStore();
const solidBackdrop = computed(() => route.name === 'entertainment' && entertainment.preferences.solidBackground);
provide(shellBackdropKey, true);
const router = useRouter();
const updates = useUpdatesStore();
const auth = useAuthStore();
const isDesktop=Boolean(window.studyRoomDesktop);
const manualUpdateDialog = ref<HTMLDialogElement>();
let dismissedUpdateVersion = "";
const showUpdateNotice = computed(() => route.name !== "focus"
  && !(route.name === 'profile' && route.query.module === 'client')
  && ["available", "required", "downloaded", "scheduled"].includes(updates.status.state)
  && !(updates.status.deferredUntil && updates.status.deferredUntil > Date.now()));
const rail = ref<InstanceType<typeof AppRail>>();
const leaveImmersive = ref<HTMLButtonElement>();
let drawerTrigger: HTMLElement | null = null;

function openAppearance(event: MouseEvent) {
  drawerTrigger = event.currentTarget as HTMLElement;
  shell.openDrawer("appearance");
}

function closeDrawer() {
  shell.closeDrawer();
}
function restoreDrawerFocus() {
  if (shell.drawer) return;
  requestAnimationFrame(() => {
    if (shell.immersive) leaveImmersive.value?.focus();
    else if (drawerTrigger?.isConnected && drawerTrigger.getClientRects().length) drawerTrigger.focus();
    else rail.value?.focusAppearance();
  });
}

function openClientVersion() {
  void router.push({ name: "profile", query: { module: "client" } });
}
function dismissManualUpdate() {
  dismissedUpdateVersion = updates.status.availableVersion || "";
  try { localStorage.setItem('moyu-update-notice-v1', `${updates.status.channel}:${dismissedUpdateVersion}`); } catch { /* In-memory dismissal still works. */ }
  if (manualUpdateDialog.value?.open) closeMotionDialog(manualUpdateDialog.value);
}
function openUpdateAction() {
  if (updates.status.state === 'manual-update-available') return openManualUpdatePage();
  dismissManualUpdate(); openClientVersion();
}
async function openManualUpdatePage() {
  const url = updates.status.downloadPageUrl;
  if (!url || !window.studyRoomDesktop) return;
  try {
    await window.studyRoomDesktop.openExternal(url);
    dismissManualUpdate();
  } catch {
    shell.toast("无法打开下载页，请稍后重试。", "error");
  }
}
function leaveImmersiveMode() {
  shell.setImmersive(false);
  requestAnimationFrame(() => rail.value?.focusAppearance());
}
function exitImmersive(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && shell.immersive && !shell.drawer && !document.querySelector('dialog[open]')) {
    leaveImmersiveMode();
  }
}
onMounted(() => document.addEventListener('keydown', exitImmersive));
onBeforeUnmount(() => document.removeEventListener('keydown', exitImmersive));
watch(
  () => [updates.status.state, updates.status.availableVersion, route.fullPath, updates.initialized, auth.isLoggedIn] as const,
  async ([state, version]) => {
    if (route.name === 'profile' && route.query.module === 'client') {
      if (manualUpdateDialog.value?.open) closeMotionDialog(manualUpdateDialog.value);
      return;
    }
    if (!['manual-update-available', 'available', 'required'].includes(state)) {
      if (manualUpdateDialog.value?.open) closeMotionDialog(manualUpdateDialog.value);
      return;
    }
    if (!isDesktop || !updates.initialized || !version || version === dismissedUpdateVersion ||
        (state !== 'manual-update-available' && (!auth.isLoggedIn || updates.status.errorCode)) || route.name === 'focus') return;
    try { if (localStorage.getItem('moyu-update-notice-v1') === `${updates.status.channel}:${version}`) return; } catch { /* Optional preference. */ }
    await nextTick();
    if (manualUpdateDialog.value && !manualUpdateDialog.value.open && !document.querySelector('dialog[open]')) {
      openMotionDialog(manualUpdateDialog.value);
      dismissedUpdateVersion = version;
      try { localStorage.setItem('moyu-update-notice-v1', `${updates.status.channel}:${version}`); } catch { /* Optional preference. */ }
    }
  },
  { immediate: true }
);

</script>

<style scoped>
.desktop-shell {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100dvh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--sr-color-canvas);
}

.desktop-shell__backdrop { position:absolute; inset:0; z-index:-1; pointer-events:none; overflow:hidden; }
.desktop-shell__backdrop :deep(.scene-background) { isolation:isolate; }
.desktop-shell__shade { position:absolute; inset:0; z-index:2; background:linear-gradient(90deg,rgba(8,12,11,.38),rgba(8,12,11,.08) 55%,rgba(8,12,11,.18)),linear-gradient(0deg,rgba(8,12,11,.2),transparent 55%); }

.desktop-shell__skip {
  position: fixed;
  z-index: calc(var(--sr-layer-toast) + 1);
  top: 8px;
  left: 8px;
  padding: 8px 12px;
  border-radius: var(--sr-radius-sm);
  background: var(--sr-color-accent);
  color: var(--sr-color-accent-ink);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  transform: translateY(-160%);
}

.desktop-shell__skip:focus {
  transform: translateY(0);
}

.desktop-shell__stage {
  position: relative;
  z-index: var(--sr-layer-stage);
  contain: layout;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: transparent;
}

/* The shared scene continues behind the reserved header/content/player rows. */
.desktop-shell__stage :deep(:is(.scene-page,.focus-page,.entertainment-page,.sound-page,.chat-page,.chat-frame,.feed-page,.profile-page,.admin-page)) { background:transparent !important; }
.desktop-shell__stage :deep(:is(.scene-page__shade,.scene-page__grain,.page-shade,.backdrop,.chat-bg,.feed-bg,.feed-shade,.profile-background,.profile-shade,.admin-background,.admin-shade)),
.desktop-shell__stage :deep(.sound-page::before),
.desktop-shell__stage :deep(.sound-page::after) { display:none; }
.desktop-shell__stage :deep(.entertainment-page .workspace) { background:transparent !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; box-shadow:none !important; }

.desktop-shell__stage :deep(.topbar),
.desktop-shell__stage :deep(.profile-topbar),
.desktop-shell__stage :deep(.admin-topbar) {
  display: none;
}

@media (max-width: 800px) {
  .desktop-shell :deep(.app-brand){white-space:nowrap}
}

.desktop-shell--compact {
  --sr-nav-top: 20px;
  --sr-page-gutter: 22px;
}

.desktop-shell__leave-immersive {
  position: fixed;
  z-index: var(--sr-layer-toast);
  right: 16px;
  top: 16px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid var(--sr-color-line-strong);
  border-radius: 99px;
  background: rgba(10, 14, 13, 0.82);
  color: var(--sr-color-text-muted);
  font-size: 11px;
  cursor: pointer;
}

.desktop-shell__update-notice {
  position: fixed;
  z-index: var(--sr-layer-toast);
  right: 24px;
  bottom: 110px;
  display: grid;
  gap: 2px;
  min-width: 148px;
  padding: 10px 15px;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 16px;
  background: rgba(17,22,20,.82);
  backdrop-filter: blur(18px);
  color: #fff;
  text-align: left;
  box-shadow: 0 12px 38px rgba(0,0,0,.24);
  cursor: pointer;
}
.desktop-shell__update-notice span { color: rgba(255,255,255,.66); font-size: 11px; font-weight: 800; }
.desktop-shell__update-notice strong { font-size: 13px; }
.desktop-shell--native .desktop-shell__leave-immersive{top:56px}
.desktop-shell__stage :deep(main:first-child){width:100%;height:100%;min-height:0;box-sizing:border-box}
.desktop-shell__player-slot{position:relative;z-index:var(--sr-layer-player);display:flex;justify-content:center;padding:8px 16px 12px;background:transparent;border:0}
.desktop-shell__player-slot :deep(.player){position:relative;inset:auto;box-sizing:border-box;width:min(820px,100%);max-width:100%;border-radius:999px;padding:8px 12px;min-height:60px}
.desktop-shell__player-slot :deep(.player__panel){position:absolute;bottom:calc(100% + 12px);right:0;width:min(460px,calc(100vw - 32px));box-sizing:border-box;max-height:60dvh;overflow:auto;padding:18px;border:1px solid #ffffff30;border-radius:22px}
.desktop-shell--immersive{grid-template-rows:minmax(0,1fr)}
.desktop-shell--native.desktop-shell--immersive{grid-template-rows:44px minmax(0,1fr)}
@media(max-width:800px){
 .desktop-shell__player-slot{padding:6px 8px}.desktop-shell__player-slot :deep(.player){min-height:56px}
}
.desktop-shell--listening{grid-template-rows:minmax(0,1fr)}.desktop-shell--native.desktop-shell--listening{grid-template-rows:minmax(0,1fr)}.desktop-shell--listening .desktop-shell__stage :deep(.topbar){display:flex}.desktop-shell--listening .desktop-shell__stage :deep(.sound-page){padding:0}.desktop-shell--listening .desktop-shell__backdrop{visibility:hidden}
/* Paint the stage behind native controls; keep content below the drag region. */
.desktop-shell--native.desktop-shell--listening > .window-chrome{position:absolute;inset:0 8px auto 0;z-index:var(--sr-layer-rail)}
.desktop-shell--native.desktop-shell--listening .desktop-shell__stage :deep(.listening-stage){box-sizing:border-box;padding-top:44px}
.desktop-shell--native.desktop-shell--listening .desktop-shell__stage :deep(.account-menu){top:118px}
</style>

<style>
.manual-update-dialog{width:min(440px,calc(100vw - 36px));box-sizing:border-box;padding:28px;border:1px solid var(--sr-color-line-strong);border-radius:24px;color:var(--sr-color-text);background:var(--sr-color-panel);box-shadow:0 24px 80px #0007}
.manual-update-dialog::backdrop{background:rgba(4,10,12,.72);backdrop-filter:blur(5px)}
.manual-update-dialog__eyebrow{margin:0 0 10px;color:var(--sr-color-text-muted);font-size:10px;letter-spacing:.16em;font-weight:700}
.manual-update-dialog h2{margin:0;font-size:24px;line-height:1.4}
.manual-update-dialog>p:not(.manual-update-dialog__eyebrow){font-size:13px;line-height:1.8;color:var(--sr-color-text-muted)}
.manual-update-dialog__note{padding:10px 12px;border:1px solid var(--sr-color-line);border-radius:12px}
.manual-update-dialog__actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
.manual-update-dialog__actions button{min-height:42px;padding:0 16px;border:1px solid var(--sr-color-line);border-radius:12px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.manual-update-dialog__actions .manual-update-dialog__primary{background:var(--sr-color-accent);color:var(--sr-color-accent-ink);border-color:transparent;font-weight:650}
.desktop-shell--listening{grid-template-rows:minmax(0,1fr)}.desktop-shell--native.desktop-shell--listening{grid-template-rows:minmax(0,1fr)}.desktop-shell--listening .desktop-shell__stage :deep(.topbar){display:flex}.desktop-shell--listening .desktop-shell__stage :deep(.sound-page){padding:0}.desktop-shell--listening .desktop-shell__backdrop{visibility:hidden}
</style>
