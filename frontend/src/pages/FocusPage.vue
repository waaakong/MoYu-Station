<template>
  <main
    class="focus-page"
    :class="{ immersive }"
    :data-focus-lock="scene.focusSnapshot?.sessionId || ''"
    :data-focus-scene="scene.focusSnapshot?.sceneKey || ''"
    :data-focus-time="scene.focusSnapshot?.timeKey || ''"
  >
    <SceneBackground v-if="!shellBackdrop" />
    <div class="page-shade"></div>

    <section class="ui-layer">
      <section class="focus-stack" data-motion-group>
        <div class="focus-topline">
          <span class="time-quote sr-glass">{{ timeQuote }}</span>
          <button class="checkin-entry sr-glass" :class="{ done: todayCheckin.checkedIn }" type="button" @click="checkinOpen = true">
            {{ todayCheckin.checkedIn ? `今日已签到 · Lv.${todayCheckin.level}` : "今日签到" }}
          </button>
        </div>

        <FocusTimerCard
          :selected-minutes="selectedMinutes"
          :remaining-seconds="remainingSeconds"
          :timer-state="timerState"
          :status="timerStatus"
          :copy="timerCopy"
          :action-label="actionLabel"
          :pending="actionPending"
          :error="focusError"
          @set-duration="setDuration"
          @toggle="toggleTimer"
          @reset="resetTimer"
        />
      </section>

      <section class="focus-controls sr-glass" data-motion-group aria-label="专注控制条">
        <div class="player__scene-group" role="group" aria-label="场景与时间控制">
        <div class="scene-switcher">
          <button class="icon-button" type="button" aria-label="上一个场景" @click="stepScene(-1)">‹</button>
          <div class="scene-meta">
            <strong>{{ activeScene.name }}</strong>
            <span>{{ activeScene.desc }}</span>
          </div>
          <button class="icon-button" type="button" aria-label="下一个场景" @click="stepScene(1)">›</button>
        </div>

        <div class="mode-picker">
          <button class="compact-button" :class="{ active: scene.timeMode !== 'manual' }" type="button" aria-haspopup="true" :aria-expanded="modeMenuOpen" @click.stop="modeMenuOpen = !modeMenuOpen">
            <span class="clock-mark">◷</span>
            <span>{{ activeMode.label }}</span>
          </button>
          <Transition v-bind="modeMotion">
            <div v-if="modeMenuOpen" class="mode-menu sr-glass sr-glass--floating" role="group" aria-label="时间跟随模式" @click.stop>
              <button v-for="mode in timeModes" :key="mode.key" type="button" :class="{ active: scene.timeMode === mode.key }" :aria-pressed="scene.timeMode === mode.key" @click="selectTimeMode(mode.key)">
                <strong>{{ mode.label }}</strong><small>{{ mode.short }}</small>
              </button>
            </div>
          </Transition>
        </div>

        <div class="time-picker">
          <button class="compact-button time-trigger" type="button" @click.stop="timeMenuOpen = !timeMenuOpen">
            <span class="day-orbit"></span>
            <span>{{ activeTime.name }}</span>
            <AppIcon name="chevronDown" class="chevron" :class="{ open: timeMenuOpen }" />
          </button>
          <Transition v-bind="timeMotion">
            <div v-if="timeMenuOpen" class="time-menu sr-glass sr-glass--floating" @click.stop>
              <button
                v-for="time in timePoints"
                :key="time.key"
                :class="{ active: time.key === scene.timeKey }"
                type="button"
                @click="selectTime(time.key)"
              >
                <i></i><span>{{ time.name }}</span>
              </button>
            </div>
          </Transition>
        </div>

        </div>
        <div class="player__audio-group" role="group" aria-label="声音与播放控制">
          <PersistentPlayer inline />
          <button class="icon-button" type="button" aria-label="沉浸模式" @click="toggleImmersive">⛶</button>
        </div>
      </section>

      <button class="memo-tab" type="button" aria-label="打开备忘录" @click="memoOpen = true">‹</button>
      <Transition v-bind="memoMotion">
        <aside v-if="memoOpen" class="memo-panel" @click.stop>
          <div class="memo-head">
            <div><small>QUICK NOTES</small><h2>备忘录</h2></div>
            <button type="button" aria-label="关闭备忘录" @click="memoOpen = false"><AppIcon name="close" /></button>
          </div>
          <h3>今日任务</h3>
          <form class="todo-form" @submit.prevent="addTodo">
            <input v-model.trim="newTodo" type="text" maxlength="80" placeholder="输入任务，按 Enter 添加" />
            <button type="submit" aria-label="添加任务"><AppIcon name="plus" /></button>
          </form>
          <ul class="todo-list">
            <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.done }">
              <button type="button" class="todo-check" @click="toggleTodo(todo)">✓</button>
              <span>{{ todo.text }}</span>
              <button type="button" class="todo-delete" aria-label="删除任务" @click="deleteTodo(todo.id)"><AppIcon name="close" /></button>
            </li>
          </ul>
          <h3>随手记</h3>
          <textarea v-model="memoText" maxlength="1200" placeholder="把突然冒出来的想法先放在这里。" @input="saveMemo"></textarea>
          <FocusHistoryImport
            v-if="authStore.isLoggedIn"
            :count="manualHistory.length"
            :range-label="manualHistoryRange"
            :pending="historyImportPending"
            @import="importManualHistory"
          />
        </aside>
      </Transition>

      <OverlayDialog :open="checkinOpen" label="今日签到" @close="checkinOpen = false">
          <div class="checkin-panel sr-glass sr-glass--floating">
            <div class="modal-head">
              <div><small>DAILY CHECK-IN</small><h2>今日签到</h2></div>
              <button type="button" aria-label="关闭签到" @click="checkinOpen = false"><AppIcon name="close" /></button>
            </div>
            <p>{{ !authStore.isLoggedIn ? "签到会写入云端账号，请先登录；计时、任务和备忘录无需登录也能使用。" : todayCheckin.checkedIn ? "今日已经签到，可以再次查看今天的提示。" : "选择一种方式，为今天抽一个学习提示。签到成功后经验 +1。" }}</p>
            <div class="level-card">
              <div><span>当前等级</span><strong>Lv.{{ todayCheckin.level || 0 }}</strong></div>
              <div><span>经验值</span><strong>{{ todayCheckin.exp || 0 }} / {{ todayCheckin.nextLevelExp || 1 }} EXP</strong></div>
              <i><b :style="{ width: `${todayCheckin.levelProgress || 0}%` }"></b></i>
            </div>
            <div class="draw-options">
              <button type="button" :disabled="!authStore.isLoggedIn || todayCheckin.checkedIn || checkinPending" @click="drawCheckin('FORTUNE')">
                <small>FORTUNE SLIP</small><strong>抽一支签</strong><span>给今天的专注一个轻轻的开场。</span>
              </button>
              <button type="button" :disabled="!authStore.isLoggedIn || todayCheckin.checkedIn || checkinPending" @click="drawCheckin('TAROT')">
                <small>TAROT CARD</small><strong>抽一张塔罗</strong><span>用一张牌解释今天适合怎样推进。</span>
              </button>
            </div>
            <article v-if="todayCheckin.checkedIn" class="draw-result">
              <small>{{ todayCheckin.drawType === "TAROT" ? "TAROT RESULT" : "FORTUNE RESULT" }}</small>
              <h3>{{ todayCheckin.title }}</h3>
              <p>{{ todayCheckin.explanation }}</p>
            </article>
            <span v-if="checkinError" class="inline-error">{{ checkinError }}</span>
          </div>
      </OverlayDialog>
    </section>

  </main>
</template>

<script setup>
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useMotionTransition } from '../motion/transitions';
const modeMotion = useMotionTransition('menu'), timeMotion = useMotionTransition('menu'), memoMotion = useMotionTransition('drawer');
import { shellBackdropKey } from "../components/scenes/shellBackdrop";
const shellBackdrop = inject(shellBackdropKey, false);
import { useRoute, useRouter } from "vue-router";
import SceneBackground from "../components/scenes/SceneBackground.vue";
import FocusHistoryImport from "./focus/FocusHistoryImport.vue";
import FocusTimerCard from "./focus/FocusTimerCard.vue";
import OverlayDialog from "../components/controls/OverlayDialog.vue";
import PersistentPlayer from '../components/player/PersistentPlayer.vue';
import { useSceneShortcuts } from "../composables/useSceneShortcuts";
import { scenes, timePoints } from "../data/scenes";

import {
  fetchFocusOverview,
  submitCheckin
} from "../services/focus";
import { listLocalFocusRecords, readFocusWorkspace, saveFocusWorkspace, saveLocalFocusRecord } from "../services/focusLocal";
import { syncPendingFocusRecords } from "../services/focusSync";
import { useAuthStore } from "../stores/auth";
import { useFocusStore } from "../stores/focus";
import { useSceneStore } from "../stores/scene";
import { useShellStore } from "../stores/shell";
import { clampFocusMinutes } from "../utils/focus";
import { measureAppViewport } from "../utils/layout";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const focusStore = useFocusStore();

const scene = useSceneStore();
const shell = useShellStore();

const canvasScale = ref(1);
const timeMenuOpen = ref(false);
const modeMenuOpen = ref(false);
const immersive = computed({ get: () => shell.immersive, set: (active) => shell.setImmersive(active) });
const memoOpen = ref(false);
const checkinOpen = ref(false);


const focusError = ref("");

const checkinError = ref("");

const selectedMinutes = ref(25);
const actionPending = ref(false);
let timerHandle = 0;
let preserveImmersivePreference = false;
const timerState = computed(() => focusStore.timerState);
const remainingSeconds = computed(() => focusStore.session
  ? focusStore.snapshot.remainingSeconds
  : timerState.value === "completed" ? 0 : selectedMinutes.value * 60);
const elapsedSeconds = computed(() => focusStore.snapshot.elapsedSeconds);
const activeRecordId = computed(() => focusStore.activeRecordId);
const accountScope = computed(() => authStore.user?.id == null ? undefined : String(authStore.user.id));

const overview = reactive({
  todayFocusMinutes: 0,
  level: 0,
  exp: 0,
  nextLevelExp: 1,
  levelProgress: 0,
  userAudio: []
});
const todayCheckin = reactive({
  checkedIn: false,
  level: 0,
  exp: 0,
  nextLevelExp: 1,
  levelProgress: 0,
  drawType: "",
  title: "",
  explanation: ""
});
const checkinPending = ref(false);

const newTodo = ref("");
const todos = ref([]);
const memoText = ref("");
const manualHistory = ref([]);
const historyImportPending = ref(false);
const manualHistoryRange = computed(() => {
  if (!manualHistory.value.length) return "";
  const dates = manualHistory.value.map((record) => record.startedAt).sort((a, b) => a - b);
  const format = (value) => new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  return `${format(dates[0])}—${format(dates[dates.length - 1])}`;
});

useSceneShortcuts();

if (scenes.some((item) => item.key === route.query.scene)) scene.setScene(route.query.scene);
if (timePoints.some((item) => item.key === route.query.time)) scene.setTime(route.query.time);

const navItems = computed(() => {
  const items = [
    { key: "scene", label: "场景", route: { name: "scene" } },
    { key: "focus", label: "专注", route: { name: "focus" } },
    { key: "entertainment", label: "娱乐", route: { name: "entertainment" } },
    { key: "chat", label: "聊天", route: { name: "chat" } },
    { key: "feed", label: "动态", route: { name: "feed" } },
    { key: "profile", label: "我的", route: { name: "profile" } }
  ];
  if (authStore.isAdmin) items.splice(5, 0, { key: "admin", label: "管理", route: { name: "admin" } });
  return items;
});

const timeModes = [
  { key: "manual", label: "手动", short: "保持当前光线" },
  { key: "smart", label: "智能跟随", short: "专注时锁定" },
  { key: "always", label: "始终跟随", short: "专注中也切换" }
];
const activeScene = computed(() => scenes.find((item) => item.key === scene.sceneKey) || scenes[0]);
const activeTime = computed(() => timePoints.find((point) => point.key === scene.timeKey) || timePoints[0]);
const activeMode = computed(() => timeModes.find((mode) => mode.key === scene.timeMode) || timeModes[0]);
const frameStyle = computed(() => ({
  "--focus-scale": canvasScale.value,
  "--focus-left": `${48 * canvasScale.value}px`,
  "--focus-bottom": `${38 * canvasScale.value}px`,
  "--player-bottom": `${34 * canvasScale.value}px`
}));
const timerStatus = computed(() => ({
  idle: "准备开始",
  running: "专注中",
  paused: "已暂停",
  completed: "本轮完成"
}[timerState.value] || "准备开始"));
const actionLabel = computed(() => {
  if (timerState.value === "running") return "Ⅱ 暂停";
  if (timerState.value === "paused") return "▶ 继续专注";
  if (timerState.value === "completed") return "▶ 再来一轮";
  return "▶ 开始专注";
});
const timerCopy = computed(() => {
  if (timerState.value === "running") return "保持现在的节奏，只处理眼前这一件事。";
  if (timerState.value === "paused") return "可以短暂停一下，回来后继续这一段时间。";
  if (timerState.value === "completed") return "这一轮已经完成，记得给自己留一点呼吸。";
  return "选择一个时长，给自己留一段完整的时间。";
});
const timeQuote = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了，慢一点也好";
  if (hour < 9) return "早上好，从一件事开始";
  if (hour < 12) return "上午好，保持节奏";
  if (hour < 14) return "午间，轻一点也好";
  if (hour < 18) return "下午好，稳住状态";
  if (hour < 20) return "黄昏，把今天收好";
  if (hour < 23) return "晚上好，留一段安静";
  return "晚安，明天继续";
});

function updateScale() {
  canvasScale.value = 1;
}

function stepScene(direction) {
  const index = scenes.findIndex((item) => item.key === scene.sceneKey);
  const next = (index + direction + scenes.length) % scenes.length;
  scene.setScene(scenes[next].key);
}

function selectTime(key) {
  scene.setTime(key);
  timeMenuOpen.value = false;
}

function selectTimeMode(mode) {
  scene.setMode(mode);
  modeMenuOpen.value = false;
}

function setDuration(minutes) {
  selectedMinutes.value = clampFocusMinutes(minutes);
  focusStore.resetCompleted();
}

function dispatchFocusState(active) {
  localStorage.setItem("studyroom-focus-active", active ? "1" : "0");
  window.dispatchEvent(new CustomEvent("studyroom:focus-state", { detail: { active } }));
}

async function beginFocus() {
  actionPending.value = true;
  focusError.value = "";
  try {
    const session = await focusStore.start({
      sceneCode: scene.sceneKey,
      timeKey: scene.timeKey,
      plannedMinutes: selectedMinutes.value,
      accountScope: accountScope.value
    });
    scene.beginFocusSession(session.clientRecordId);
    dispatchFocusState(true);
  } catch (error) {
    focusError.value = error.message || "暂时无法开始专注。";
  } finally {
    actionPending.value = false;
  }
}

async function completeFocus() {
  if (!activeRecordId.value || actionPending.value) return;
  actionPending.value = true;
  try {
    const record = await focusStore.complete();
    overview.todayFocusMinutes += record?.completedMinutes || 0;
    dispatchFocusState(false);
    scene.endFocusSession();
    if (record?.syncPolicy === "automatic" && record.accountScope === accountScope.value) {
      try {
        await syncPendingFocusRecords(record.accountScope);
      } catch {
        focusError.value = "本轮已安全保存在本机，联网后会自动重试同步。";
      }
    }
  } catch (error) {
    focusError.value = error.message || "专注记录暂时无法保存到本机。";
    focusStore.pause();
    dispatchFocusState(false);
  } finally {
    actionPending.value = false;
  }
}

async function toggleTimer() {
  if (timerState.value === "idle" || timerState.value === "completed") {
    if (timerState.value === "completed") setDuration(selectedMinutes.value);
    await beginFocus();
    return;
  }
  if (timerState.value === "running") {
    focusStore.pause();
    dispatchFocusState(false);
  } else {
    focusStore.resume();
    dispatchFocusState(true);
  }
}

async function resetTimer() {
  try {
    await focusStore.cancel();
    dispatchFocusState(false);
    scene.endFocusSession();
  } catch (error) {
    focusError.value = error.message || "取消记录暂时无法保存到本机。";
  }
}

function tickTimer() {
  if (timerState.value !== "running") return;
  if (focusStore.refresh()) void completeFocus();
}

async function handleNav(item) {
  timeMenuOpen.value = false;
  modeMenuOpen.value = false;

  if (item.key === "focus") return;
  await router.push(item.route);
}

function toggleImmersive() {
  immersive.value = !immersive.value;
  shell.setImmersive(immersive.value);
  if (activeRecordId.value && immersive.value) localStorage.setItem("studyroom-focus-immersive", "1");
  else localStorage.removeItem("studyroom-focus-immersive");
  if (immersive.value && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (!immersive.value && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

function hydrateCheckin(data) {
  Object.assign(todayCheckin, {
    checkedIn: Boolean(data?.checkedIn),
    level: data?.level ?? overview.level ?? 0,
    exp: data?.exp ?? overview.exp ?? 0,
    nextLevelExp: data?.nextLevelExp ?? overview.nextLevelExp ?? 1,
    levelProgress: data?.levelProgress ?? overview.levelProgress ?? 0,
    drawType: data?.drawType || "",
    title: data?.title || "",
    explanation: data?.explanation || ""
  });
}

async function drawCheckin(type) {
  if (!authStore.isLoggedIn) {
    checkinError.value = "请先登录后再签到。";
    return;
  }
  checkinPending.value = true;
  checkinError.value = "";
  try {
    hydrateCheckin(await submitCheckin(type));
  } catch (error) {
    checkinError.value = error.message || "签到失败，请稍后重试。";
  } finally {
    checkinPending.value = false;
  }
}

function workspaceScope() {
  return accountScope.value ? `account:${accountScope.value}` : "guest";
}

async function loadMemo() {
  try {
    let saved = await readFocusWorkspace(workspaceScope());
    if (!saved) {
      const legacyKey = `studyroom-focus-memo-${authStore.user?.id || "guest"}`;
      const legacy = JSON.parse(localStorage.getItem(legacyKey) || "null");
      if (legacy && typeof legacy === "object") {
        todos.value = Array.isArray(legacy.todos)
          ? legacy.todos.filter((todo) => todo?.text).map((todo) => ({
              id: String(todo.id || crypto.randomUUID()),
              text: String(todo.text).slice(0, 500),
              done: Boolean(todo.done),
              updatedAt: Date.now()
            }))
          : [];
        memoText.value = String(legacy.memoText || "").slice(0, 20_000);
        await saveMemo();
        saved = await readFocusWorkspace(workspaceScope());
      }
    }
    todos.value = Array.isArray(saved?.todos) ? saved.todos : [];
    memoText.value = saved?.memoText || "";
  } catch {
    todos.value = [];
    memoText.value = "";
  }
}

async function saveMemo() {
  await saveFocusWorkspace({
    version: 1,
    accountScope: workspaceScope(),
    todos: todos.value.map((todo) => ({ ...todo, id: String(todo.id), updatedAt: todo.updatedAt || Date.now() })),
    memoText: memoText.value,
    updatedAt: Date.now()
  });
}

async function loadManualHistory() {
  if (!accountScope.value) {
    manualHistory.value = [];
    return;
  }
  const earliest = Date.now() - 365 * 24 * 60 * 60 * 1000;
  manualHistory.value = (await listLocalFocusRecords({ syncPolicy: "manual-only", limit: 500 }))
    .filter((record) => record.status === "completed" && record.startedAt >= earliest && (record.completedSeconds ?? record.completedMinutes * 60) > 0)
    .slice(0, 100);
}

async function importManualHistory() {
  if (!accountScope.value || !manualHistory.value.length) return;
  const accepted = window.confirm(`将 ${manualHistory.value.length} 条本地专注记录（${manualHistoryRange.value}）导入当前账号。是否继续？`);
  if (!accepted) return;
  historyImportPending.value = true;
  focusError.value = "";
  try {
    await Promise.all(manualHistory.value.map((record) => saveLocalFocusRecord({
      ...record,
      syncPolicy: "automatic",
      syncStatus: "pending",
      accountScope: accountScope.value,
      syncError: undefined
    })));
    await syncPendingFocusRecords(accountScope.value);
    await loadManualHistory();
  } catch {
    focusError.value = "导入记录已保存在同步队列，联网后会继续重试。";
  } finally {
    historyImportPending.value = false;
  }
}

function addTodo() {
  if (!newTodo.value) return;
  todos.value.push({ id: String(Date.now()), text: newTodo.value, done: false, updatedAt: Date.now() });
  newTodo.value = "";
  void saveMemo();
}

function toggleTodo(todo) {
  todo.done = !todo.done;
  todo.updatedAt = Date.now();
  void saveMemo();
}

function deleteTodo(id) {
  todos.value = todos.value.filter((todo) => todo.id !== id);
  void saveMemo();
}

function restoreSession() {
  const saved = focusStore.session;
  if (!saved) return;
  const restored = scene.restoreFocusSession({ sessionId: saved.clientRecordId, sceneKey: saved.sceneCode, timeKey: saved.timeKey });
  if (!restored) return;
  selectedMinutes.value = clampFocusMinutes(saved.plannedMinutes);
  dispatchFocusState(saved.state === "running");
  if (localStorage.getItem("studyroom-focus-immersive") === "1") {
    immersive.value = true;
    shell.setImmersive(true);
  }
  focusStore.refresh();
}

async function loadPageData() {
  if (!authStore.isLoggedIn) return;
  try {
    const focusData = await fetchFocusOverview();
    Object.assign(overview, focusData || {});
    hydrateCheckin(focusData?.todayCheckin || {});
  } catch (error) {
    focusError.value = error.message || "专注页数据加载失败。";
  }
}

function retryFocusSync() {
  if (accountScope.value) void syncPendingFocusRecords(accountScope.value).catch(() => {});
}

function closeFloatingPanels() {
  timeMenuOpen.value = false;
  modeMenuOpen.value = false;
}

function handleFullscreenChange() {
  if (!document.fullscreenElement && immersive.value) {
    immersive.value = false;
    shell.setImmersive(false);
    localStorage.removeItem("studyroom-focus-immersive");
  }
}

onMounted(async () => {
  if (route.query.scene || route.query.time) void router.replace({ name: "focus" });
  updateScale();
  window.addEventListener("resize", updateScale);
  window.addEventListener("online", retryFocusSync);
  document.addEventListener("click", closeFloatingPanels);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  restoreSession();
  await loadPageData();
  await loadMemo();
  await loadManualHistory();
  if (accountScope.value) void syncPendingFocusRecords(accountScope.value).catch(() => {});

});



watch(immersive, (active) => {
  if (!active) {
    if (!preserveImmersivePreference) localStorage.removeItem("studyroom-focus-immersive");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
});

watch(accountScope, async () => {
  await loadMemo();
  await loadManualHistory();
  if (accountScope.value) void syncPendingFocusRecords(accountScope.value).catch(() => {});
});

onBeforeUnmount(() => {
  preserveImmersivePreference = Boolean(activeRecordId.value && immersive.value);
  window.clearInterval(timerHandle);
  window.removeEventListener("resize", updateScale);
  window.removeEventListener("online", retryFocusSync);
  document.removeEventListener("click", closeFloatingPanels);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  focusStore.persistSession();
  shell.setImmersive(false);
  if (preserveImmersivePreference) localStorage.setItem("studyroom-focus-immersive", "1");
});
</script>

<style scoped>
.focus-page {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111717;
  color: #fff;
}

.page-shade {
  position: absolute;
  inset: 0;
}

.page-shade {
  z-index: 1;
  background: linear-gradient(90deg, rgba(8, 11, 12, .4), rgba(8, 11, 12, .08) 52%, rgba(8, 11, 12, .2));
  pointer-events: none;
}

.ui-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  grid-template-rows: minmax(min-content, 1fr) auto;
  gap: 16px;
  padding: 24px var(--sr-page-gutter);
  overflow: auto;
  box-sizing: border-box;
  transition: opacity 180ms ease;
}

.topbar {
  position: fixed;
  top: 30px;
  right: 46px;
  z-index: 20;
  transform: scale(var(--focus-scale));
  transform-origin: top right;
}

.nav-tabs {
  display: inline-flex;
  align-items: center;
  min-height: 53px;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 999px;
  background: rgba(16, 18, 19, .74);
  backdrop-filter: blur(18px);
  box-shadow: 0 14px 40px rgba(0, 0, 0, .2);
}

.nav-item {
  min-width: 64px;
  height: 41px;
  padding: 0 15px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, .84);
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  transition: background 220ms ease, color 220ms ease, transform 220ms cubic-bezier(.22, 1, .36, 1);
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, .1);
  transform: translateY(-1px);
}

.nav-item.active {
  color: #fff;
  background: rgba(255, 255, 255, .2);
}

.nav-item.active:hover { transform: none; }

.focus-stack {
  position: relative;
  align-self: center;
  z-index: 5;
  width: min(410px, 100%);
}

.focus-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.time-quote,
.checkin-entry {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 999px;
  background: rgba(28, 31, 31, .56);
  color: rgba(255, 255, 255, .9);
  font-size: 13px;
  font-weight: 800;
  backdrop-filter: blur(18px);
}

.time-quote { display: inline-flex; align-items: center; }
.checkin-entry { cursor: pointer; transition: transform 220ms ease, background 220ms ease; }
.checkin-entry:hover { transform: translateY(-1px); background: rgba(255, 255, 255, .16); }
.checkin-entry.done { color: #fff0bd; }

.music-popover,
.memo-panel,
.checkin-panel {
  border: 1px solid rgba(255, 255, 255, .18);
  background: rgba(30, 33, 34, .58);
  backdrop-filter: blur(28px);
  box-shadow: 0 28px 90px rgba(0, 0, 0, .25);
}

.focus-controls {
  position: relative;
  justify-self: center;
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 9px;
  width: min(980px, 100%);
  flex-wrap: wrap;
  justify-content: center;
  box-sizing: border-box;
  min-height: 58px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: var(--sr-radius-panel, 20px);
  background: rgba(17, 32, 24, .93);
  backdrop-filter: blur(22px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
}

.scene-switcher {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 36px;
  align-items: center;
  width: 310px;
}

.player__scene-group,.player__audio-group { display:flex; align-items:center; justify-content:center; gap:9px; flex:0 1 auto; min-width:0; max-width:100%; }
.player__scene-group { flex-wrap:wrap; }
.player__audio-group { flex-wrap:nowrap; }

.icon-button,
.play-button,
.volume-button,
.music-actions button {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  color: #fff;
  cursor: pointer;
  transition: transform 200ms ease, background 200ms ease;
}
@media (hover: hover) and (pointer: fine) {
  .icon-button:hover,.play-button:hover,.volume-button:hover { background: rgba(255, 255, 255, .16); }
}

.scene-meta { display: grid; min-width: 0; padding: 0 8px; }
.scene-meta strong { font-size: 13px; }
.scene-meta span {
  overflow: hidden;
  color: rgba(255, 255, 255, .62);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 13px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 999px;
  background: rgba(255, 255, 255, .06);
  color: rgba(255, 255, 255, .82);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.compact-button.active { background: rgba(255, 255, 255, .16); color: #fff0bd; }
.clock-mark { font-size: 16px; }
.mode-picker,
.time-picker { position: relative; }
.day-orbit { width: 12px; height: 12px; border: 1px solid rgba(255, 255, 255, .72); border-radius: 50%; }
.chevron { transition: transform 220ms ease; }
.chevron.open { transform: rotate(180deg); }

.time-menu {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 14px);
  display: grid;
  gap: 3px;
  width: 150px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 18px;
  background: rgba(24, 27, 27, .88);
  backdrop-filter: blur(24px);
  transform: translateX(-50%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
}
.time-menu button {
  display: grid;
  grid-template-columns: 16px 1fr;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(255, 255, 255, .76);
  text-align: left;
  cursor: pointer;
}
.time-menu button:hover:not(:disabled) { background: rgba(255, 255, 255, .1); color: #fff; }
.time-menu button i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255, 255, 255, .24); }
.time-menu button.active i { background: #f3dfaa; box-shadow: 0 0 0 4px rgba(243, 223, 170, .14); animation: breathe 1.8s ease-in-out infinite; }
.time-menu button:disabled { opacity: .48; cursor: default; }

.mode-menu {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 14px);
  display: grid;
  gap: 4px;
  width: 190px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 18px;
  background: rgba(24, 27, 27, .92);
  backdrop-filter: blur(24px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .3);
  transform: translateX(-50%);
}

.mode-menu button {
  display: grid;
  gap: 2px;
  min-height: 46px;
  padding: 7px 10px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: rgba(255, 255, 255, .72);
  text-align: left;
  cursor: pointer;
}

.mode-menu button:hover,
.mode-menu button.active { background: rgba(255, 255, 255, .11); color: #fff; }
.mode-menu button:focus-visible { outline: 2px solid rgba(255, 255, 255, .88); outline-offset: 1px; }
.mode-menu strong { font-size: 12px; }
.mode-menu small { color: rgba(255, 255, 255, .5); font-size: 9px; }

.music-toggle.active { color: #fff0bd; background: rgba(255, 255, 255, .16); }
.sound-control { display: flex; align-items: center; gap: 8px; margin-left: 0; }
.sound-control > span { font-size: 12px; font-weight: 800; }
.volume-button { width: 30px; height: 30px; font-weight: 900; }
.volume-wrap { position: relative; display: flex; align-items: center; width: 100px; }
.volume-wrap input { width: 100%; accent-color: #f4f4f0; cursor: pointer; }
.volume-tip {
  position: absolute;
  left: 50%;
  bottom: 30px;
  padding: 4px 7px;
  border-radius: 8px;
  background: rgba(0, 0, 0, .76);
  font-size: 10px;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 180ms ease, transform 180ms ease;
  pointer-events: none;
}
.volume-wrap:hover .volume-tip,
.volume-wrap:focus-within .volume-tip { opacity: 1; transform: translate(-50%, 0); }
.play-button { background: rgba(255, 255, 255, .92); color: #17191a; }

.music-popover {
  position: fixed;
  left: 50%;
  bottom: 106px;
  z-index: 10;
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100dvh - 180px);
  overflow: auto;
  box-sizing: border-box;
  padding: 18px;
  border-radius: 24px;
  transform: translateX(-50%);
  transform-origin: bottom center;
}

.music-now {
  display: grid;
  grid-template-columns: 74px 1fr;
  align-items: center;
  gap: 14px;
}
.album-art {
  display: grid;
  place-items: center;
  width: 74px;
  height: 74px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 18px;
  background: radial-gradient(circle at 66% 25%, rgba(244, 224, 166, .8), transparent 22%), #31413f;
}
.album-art span {
  width: 48px;
  height: 48px;
  border: 12px solid #111719;
  border-radius: 50%;
  background: #d8d9d5;
  box-shadow: inset 0 0 0 5px #31383a;
}
.album-art span.spinning { animation: spin 4s linear infinite; }
.music-now small,
.memo-head small,
.modal-head small { color: rgba(255, 255, 255, .55); font-size: 10px; font-weight: 900; letter-spacing: 1px; }
.music-now h2 { margin: 4px 0 2px; font-size: 20px; }
.music-now p { margin: 0; color: rgba(255, 255, 255, .62); font-size: 12px; }
.track-progress {
  display: grid;
  grid-template-columns: 42px 1fr 42px;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.track-progress input { width: 100%; accent-color: #f5f5ef; }
.track-progress span:last-child { text-align: right; }
.music-actions { display: flex; justify-content: center; gap: 10px; margin: 12px 0; }
.music-actions button { width: 34px; height: 34px; font-size: 10px; }
.music-actions button.main { width: 42px; height: 42px; background: rgba(255, 255, 255, .92); color: #121516; }
.music-search {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 13px;
  background: rgba(255, 255, 255, .08);
}
.music-search input { flex: 1; border: 0; outline: 0; background: transparent; color: #fff; }
.music-search input::placeholder { color: rgba(255, 255, 255, .5); }
.audio-list {
  display: grid;
  gap: 7px;
  max-height: 190px;
  margin-top: 10px;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, .42) transparent;
}
.audio-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 52px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 13px;
  background: rgba(255, 255, 255, .06);
  color: #fff;
  text-align: left;
  cursor: pointer;
}
.audio-row.active { border-color: rgba(255, 255, 255, .65); background: rgba(255, 255, 255, .13); }
.audio-dot { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: rgba(180, 207, 197, .22); font-size: 18px; }
.audio-copy { display: grid; min-width: 0; }
.audio-copy strong,
.audio-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audio-copy strong { font-size: 12px; }
.audio-copy small,
.audio-length { color: rgba(255, 255, 255, .56); font-size: 10px; }
.delete-audio {
  width: 27px;
  height: 27px;
  border: 1px solid rgba(255, 125, 125, .28);
  border-radius: 50%;
  background: rgba(113, 39, 39, .28);
  color: #ffc2c2;
  cursor: pointer;
}
.upload-audio {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 44px;
  margin-top: 10px;
  padding: 0 12px;
  border: 1px dashed rgba(255, 255, 255, .22);
  border-radius: 13px;
  cursor: pointer;
}
.upload-audio input { display: none; }
.upload-audio span { font-size: 12px; font-weight: 900; }
.upload-audio small { color: rgba(255, 255, 255, .5); font-size: 9px; }

.memo-tab {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 9;
  width: 26px;
  height: 90px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-right: 0;
  border-radius: 18px 0 0 18px;
  background: rgba(21, 24, 24, .62);
  color: rgba(255, 255, 255, .72);
  cursor: pointer;
  backdrop-filter: blur(16px);
  transform: translateY(-50%) scale(var(--focus-scale));
  transform-origin: center right;
}
.memo-panel {
  position: fixed;
  top: 50%;
  right: 26px;
  z-index: 12;
  width: 350px;
  max-height: 670px;
  padding: 22px;
  overflow: auto;
  border-radius: 24px;
  transform: translateY(-50%) scale(var(--focus-scale));
  transform-origin: center right;
}
.memo-head,
.modal-head { display: flex; align-items: flex-start; justify-content: space-between; }
.memo-head h2,
.modal-head h2 { margin: 4px 0 0; font-size: 24px; }
.memo-head button,
.modal-head button {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  color: #fff;
  cursor: pointer;
}
.memo-panel h3 { margin: 22px 0 10px; font-size: 13px; }
.todo-form { display: grid; grid-template-columns: 1fr 38px; gap: 8px; }
.todo-form input {
  min-width: 0;
  height: 42px;
  padding: 0 12px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 12px;
  outline: 0;
  background: rgba(255, 255, 255, .07);
  color: #fff;
}
.todo-form button {
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, .9);
  color: #151718;
  font-size: 20px;
  cursor: pointer;
}
.todo-list { display: grid; gap: 7px; margin: 10px 0 0; padding: 0; list-style: none; }
.todo-list li {
  display: grid;
  grid-template-columns: 28px 1fr 28px;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .06);
  font-size: 12px;
}
.todo-check,
.todo-delete { width: 26px; height: 26px; border: 0; border-radius: 50%; background: rgba(255, 255, 255, .1); color: transparent; cursor: pointer; }
.todo-delete { color: rgba(255, 255, 255, .55); }
.todo-list li.done .todo-check { color: #151718; background: #f0e0b5; }
.todo-list li.done span { color: rgba(255, 255, 255, .42); text-decoration: line-through; }
.memo-panel textarea {
  width: 100%;
  min-height: 150px;
  padding: 13px;
  resize: vertical;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 14px;
  outline: 0;
  background: rgba(255, 255, 255, .07);
  color: #fff;
  line-height: 1.7;
}

.checkin-panel { width: 560px; padding: 26px; border-radius: 26px; }
.modal-head button{display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1;flex-shrink:0}
.checkin-panel > p { color: rgba(255, 255, 255, .68); line-height: 1.7; }
.level-card {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 15px;
  border-radius: 16px;
  background: rgba(255, 255, 255, .08);
}
.level-card div { display: grid; gap: 4px; }
.level-card span { color: rgba(255, 255, 255, .58); font-size: 11px; }
.level-card strong { font-size: 16px; }
.level-card i { grid-column: 1 / -1; height: 6px; overflow: hidden; border-radius: 999px; background: rgba(255, 255, 255, .12); }
.level-card b { display: block; height: 100%; border-radius: inherit; background: #eedba3; transition: width 500ms ease; }
.draw-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
.draw-options button {
  display: grid;
  gap: 7px;
  min-height: 130px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 16px;
  background: rgba(255, 255, 255, .06);
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: transform 220ms ease, background 220ms ease;
}
.draw-options button:hover:not(:disabled) { transform: translateY(-2px); background: rgba(255, 255, 255, .12); }
.draw-options button:disabled { opacity: .48; cursor: default; }
.draw-options small { color: rgba(255, 255, 255, .48); font-size: 9px; letter-spacing: 1px; }
.draw-options strong { font-size: 18px; }
.draw-options span { color: rgba(255, 255, 255, .62); font-size: 12px; line-height: 1.6; }
.draw-result { margin-top: 14px; padding: 18px; border: 1px solid rgba(239, 216, 153, .22); border-radius: 16px; background: rgba(94, 79, 42, .16); }
.draw-result small { color: #eedba3; font-size: 9px; letter-spacing: 1px; }
.draw-result h3 { margin: 7px 0; }
.draw-result p { margin: 0; color: rgba(255, 255, 255, .7); line-height: 1.7; }
.inline-error { display: block; margin-top: 9px; color: #ffd0c6; font-size: 11px; }

.focus-page.immersive .ui-layer { opacity: 0; visibility: hidden; pointer-events: none; }
.exit-immersive {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 60;
  padding: 10px 16px;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 999px;
  background: rgba(15, 18, 18, .58);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(16px);
}

.menu-enter-active,
.menu-leave-active,
.popover-enter-active,
.popover-leave-active,
.memo-enter-active,
.memo-leave-active,
.modal-enter-active,
.modal-leave-active { transition: opacity 260ms ease, transform 300ms cubic-bezier(.22, 1, .36, 1); }
.menu-enter-from,
.menu-leave-to { opacity: 0; transform: translate(-50%, 8px) scale(.97); }
.popover-enter-from,
.popover-leave-to { opacity: 0; transform: translate(-50%, 12px); }
.memo-enter-from,
.memo-leave-to { opacity: 0; transform: translate(18px, -50%); }
.modal-enter-from,
.modal-leave-to { opacity: 0; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { 50% { box-shadow: 0 0 0 7px rgba(243, 223, 170, .05); } }

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
.memo-panel,.checkin-panel{max-height:calc(100% - 32px);max-width:calc(100% - 32px);overflow:auto;box-sizing:border-box}
.icon-button,.play-button,.volume-button{width:44px;height:44px}.compact-button{min-height:44px;border-radius:12px}.scene-switcher{grid-template-columns:44px minmax(0,1fr) 44px;max-width:100%}.checkin-entry,.exit-immersive{min-height:44px}.memo-tab{width:36px;right:0;height:72px}.memo-panel{right:16px;transform:translateY(-50%)}.memo-head button,.modal-head button{width:44px;height:44px}.sound-control input[type=range]{min-height:28px}.menu-enter-active,.menu-leave-active,.popover-enter-active,.popover-leave-active,.memo-enter-active,.memo-leave-active{transition:opacity 180ms ease,transform 220ms var(--sr-ease-out)}
.sr-reduced-transparency .focus-controls,.sr-reduced-transparency .memo-panel,.sr-reduced-transparency .checkin-panel{background:#13211a;backdrop-filter:none}
@media(max-height:760px) and (min-width:801px){.ui-layer{padding-block:14px;gap:12px}.focus-topline{margin-bottom:8px}.time-quote,.checkin-entry{min-height:36px;padding-inline:12px;font-size:11px}.focus-controls{min-height:58px;padding:6px 10px}.focus-stack{width:390px}}
@media(max-width:800px){.ui-layer{grid-template-rows:auto auto;align-content:start;padding:20px 16px}.focus-stack{justify-self:center}.focus-controls{padding:12px}.sound-control{margin-left:0;flex-wrap:wrap}.memo-tab{top:auto;bottom:24px;transform:none}.memo-panel{right:12px;width:calc(100% - 24px)}}

.player__audio-group{flex:1 1 400px;max-width:490px}.player__scene-group{flex:0 1 auto}
.focus-controls{min-height:min-content;align-self:end}
.ui-layer{display:flex;flex-direction:column;align-items:flex-start}
.focus-stack{flex:0 0 auto;margin-block:auto;align-self:flex-start}
.focus-controls{flex:0 0 auto;align-self:center}
@media(max-width:800px){.focus-stack{align-self:center}}
@media(max-width:800px){.player__audio-group{flex-basis:100%;max-width:100%}}
</style>
