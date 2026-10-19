<template>
  <DesktopWindowHost />
  <MessageNotificationHost />
  <DesktopShell v-if="usesDesktopShell">
    <RouterView v-slot="{ Component }" :key="pageSessionKey">
      <component :is="Component" ref="routePage" />
    </RouterView>
  </DesktopShell>
  <div v-else class="standalone-layout" :class="{ 'standalone-desktop': isDesktop }">
    <AppTitlebar floating />
    <RouterView v-slot="{ Component }" :key="pageSessionKey">
      <component :is="Component" ref="routePage" />
    </RouterView>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createStartupRunner } from './startup/runner';
import { attachStartupMotion } from './startup/motion';
import { hasVolatileWork, prepareLocalQuit } from './window/quitPreparation';
import { useRoute, useRouter } from "vue-router";
import DesktopShell from "./layouts/DesktopShell.vue";
import AppTitlebar from './components/window/AppTitlebar.vue';
import DesktopWindowHost from './components/window/DesktopWindowHost.vue';
import MessageNotificationHost from './components/states/MessageNotificationHost.vue';
import { startMessageNotifications } from './notifications/runtime';
import { usePageMotion } from './composables/usePageMotion';
import { startInteractionMotion } from './motion/interactions';
import { setMotionReduced, resetDialogMotions } from './motion/runtime';
const routePage = ref();
const isDesktop = Boolean(window.studyRoomDesktop);
const startup = createStartupRunner(window.moyuStartupOverlay);
const stopStartupMotion = attachStartupMotion();
window.moyuStartupOverlay?.bindRestart(async () => {
  if (hasVolatileWork()) throw new Error('UNSAVED_WORK');
  await prepareLocalQuit();
  startup.cancel();
  window.location.reload();
});
import {startFocusRuntime} from './focus/runtime';
import {startActivityRuntime} from './activity/runtime';
import {startDesktopLyrics} from './audio/lyrics/desktopLyrics';
import {activityState} from './activity/state';
import {bindFocusNavigation} from './focus/navigation';
import {startPrivateSceneRuntime} from './scenes/privateRuntime';
import {privateSceneApi} from './scenes/privateApi';
import { featureFlags } from "./config/features";
import { http } from "./services/http";
import { useAuthStore } from "./stores/auth";
import { useProvidersStore } from './stores/providers';
import { useProviderLibraryStore } from './stores/providerLibrary';
import { useCapabilitiesStore } from "./stores/capabilities";
import { usePlayerStore } from "./stores/player";
import { useQueueStore } from "./stores/queue";
import { useSceneStore } from "./stores/scene";
import { useShellStore } from "./stores/shell";
import { useSoundStore } from "./stores/sound";
import { useUpdatesStore } from "./stores/updates";

let heartbeatTimer = 0;
let sceneResizeTimer = 0;
let stopFocusRuntime;
let stopActivityRuntime;
let stopDesktopLyrics;
let stopPrivateSceneRuntime;
let stopInteractionMotion;
const route = useRoute();
const router = useRouter();
const stopFocusNavigation = bindFocusNavigation(router);
const stopMessageNotifications = startMessageNotifications(router);
const authStore = useAuthStore();
const pageSessionKey = computed(() => ['chat', 'feed'].includes(String(route.name))
  ? `${authStore.sessionGeneration}:${authStore.user?.id ?? 'guest'}` : 'local');
const capabilitiesStore = useCapabilitiesStore();
const playerStore = usePlayerStore();
watch(() => [authStore.user?.id, authStore.sessionGeneration, authStore.isBanned], () => {
  resetDialogMotions();
  if (!window.studyRoomDesktop) return;
  useProvidersStore().invalidateIdentity();
  useProvidersStore().statuses = [];
  useProviderLibraryStore().reset();
  playerStore.applicationIdentityChanged(authStore.isLoggedIn && !authStore.isBanned);
}, {flush:'sync'});
const queueStore = useQueueStore();
const sceneStore = useSceneStore();
const shellStore = useShellStore();
const soundStore = useSoundStore();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)');
function syncSystemAppearance() {
  shellStore.systemReducedMotion = motionQuery.matches;
  shellStore.systemReducedTransparency = transparencyQuery.matches;
}
syncSystemAppearance();
watch(() => [shellStore.motionReduced,shellStore.transparencyReduced,shellStore.preferences.lowPerformance], ([motion,transparency,low]) => {
  document.documentElement.classList.toggle('sr-reduced-motion',motion);
  document.documentElement.classList.toggle('sr-reduced-transparency',transparency);
  document.documentElement.classList.toggle('sr-low-performance',low);
  setMotionReduced(motion);
}, {immediate:true});
const updatesStore = useUpdatesStore();
sceneStore.hydrate();
sceneStore.updateRuntime({ viewportWidth: window.innerWidth, lowPerformance: shellStore.preferences.lowPerformance });
const focusActive = ref(localStorage.getItem("studyroom-focus-active") === "1");
const audioActive = computed(() => playerStore.playback.status === "playing"
  || soundStore.settings.ambientTracks.some((track) => track.status === "playing"));
const usesDesktopShell = computed(() => (
  (featureFlags.desktopShell || featureFlags.v2Pages) && route.meta.shell !== false
));
usePageMotion({
  root: () => routePage.value?.$el,
  reduced: () => shellStore.motionReduced,
  withinShell: () => usesDesktopShell.value,
  sessionKey: () => pageSessionKey.value
});

function currentOnlineStatus() {
  if (focusActive.value) return "FOCUSING";
  if (route.name === "entertainment") return "PLAYING";
  return "IDLE";
}

function handleFocusState(event) {
  focusActive.value = Boolean(event.detail?.active);
  sendHeartbeat();
}

function handleSceneResize() {
  window.clearTimeout(sceneResizeTimer);
  sceneResizeTimer = window.setTimeout(() => sceneStore.updateRuntime({ viewportWidth: window.innerWidth }), 180);
}

async function sendHeartbeat() {
  if (!authStore.isLoggedIn) return;
  try {
    await http.post("/monitor/heartbeat", { onlineStatus: currentOnlineStatus(),activityVersion:activityState.enabled?2:0 });
  } catch {
    // Heartbeat is best-effort and should never interrupt page usage.
  }
}

onMounted(async () => {
  stopInteractionMotion = startInteractionMotion();
  motionQuery.addEventListener('change', syncSystemAppearance);
  transparencyQuery.addEventListener('change', syncSystemAppearance);
  window.addEventListener("studyroom:focus-state", handleFocusState);
  window.addEventListener("resize", handleSceneResize);
  const started = await startup.run([
    { label: '正在恢复本地空间', run: () => {
      sceneStore.startClock();
      stopFocusRuntime=startFocusRuntime();
      stopActivityRuntime=startActivityRuntime();
      stopPrivateSceneRuntime=startPrivateSceneRuntime();
    } },
    { label: '正在连接本机功能', run: () => capabilitiesStore.load() },
    { label: '正在恢复播放队列', run: () => queueStore.hydrate() },
    { label: '正在恢复声音设置', run: async () => {
      playerStore.initialize();
      stopDesktopLyrics=startDesktopLyrics();
      soundStore.setLowPerformance(shellStore.preferences.lowPerformance);
      await soundStore.initialize();
    } },
    { label: '正在准备界面', run: async () => {
      await router.isReady();
      await nextTick();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } }
  ]);
  if (!started) {
    if (!isDesktop) shellStore.toast('本地初始化未完成，请刷新后重试。', 'error');
    return;
  }
  void updatesStore.initialize(authStore.isLoggedIn).catch(() => { /* Update status owns its error state. */ });
  sendHeartbeat();
  heartbeatTimer = window.setInterval(sendHeartbeat, 15000);
});

watch(
  () => [route.name, authStore.isLoggedIn],
  () => {
    sendHeartbeat();
    if(route.name==='scene' && authStore.isLoggedIn)void privateSceneApi().refresh();
  }
);

watch(
  () => shellStore.preferences.lowPerformance,
  (enabled) => {
    soundStore.setLowPerformance(enabled);
    sceneStore.updateRuntime({ lowPerformance: enabled });
  }
);

watch(
  () => authStore.isLoggedIn,
  (authenticated) => { void updatesStore.setAuthenticated(authenticated); }
);

watch(
  () => [focusActive.value, audioActive.value],
  ([focus, audio]) => { void updatesStore.setActivity(Boolean(focus), Boolean(audio)); },
  { immediate: true }
);

watch(
  () => [updatesStore.status.state, updatesStore.status.errorCode],
  ([state, errorCode]) => {
    if (state === "required" && !errorCode && !route.meta.localAccess && !["profile", "login"].includes(String(route.name))) {
      void router.push({ name: "profile", query: { module: "client", reason: "required-update" } });
    }
  }
);

onBeforeUnmount(async () => {
  startup.cancel();
  window.moyuStartupOverlay?.dispose();
  stopStartupMotion();
  stopFocusNavigation();
  stopMessageNotifications();
  motionQuery.removeEventListener('change', syncSystemAppearance);
  transparencyQuery.removeEventListener('change', syncSystemAppearance);
  stopFocusRuntime?.();
  stopActivityRuntime?.();
  stopDesktopLyrics?.();
  stopPrivateSceneRuntime?.();
  stopInteractionMotion?.();
  resetDialogMotions();
  window.clearInterval(heartbeatTimer);
  window.clearTimeout(sceneResizeTimer);
  window.removeEventListener("studyroom:focus-state", handleFocusState);
  window.removeEventListener("resize", handleSceneResize);
  sceneStore.disposeClock();
  await soundStore.dispose();
  updatesStore.dispose();
  playerStore.dispose();
});
</script>

<style>
.standalone-layout{position:relative;height:100dvh;overflow:hidden}
.standalone-desktop > .window-chrome{position:absolute;inset:8px 8px auto;z-index:var(--sr-layer-rail)}
.standalone-layout > :not(.window-chrome){position:relative;isolation:isolate;contain:layout paint;min-height:0;height:100%;overflow:auto}
</style>
