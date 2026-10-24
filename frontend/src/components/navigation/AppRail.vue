<template>
  <header class="app-chrome" :class="{ 'app-chrome--desktop': isDesktop, 'app-chrome--account-open': accountOpen }">
    <div class="app-chrome__main">
      <RouterLink class="app-brand" to="/scene" aria-label="墨屿自习室 场景"><BrandMark class="app-brand__icon" /><strong>墨屿</strong></RouterLink>
      <nav v-motion-nav class="app-nav app-nav--primary sr-glass" aria-label="主要功能">
        <RouterLink v-for="item in primaryItems" :key="item.name" class="app-nav__item" :class="{ 'app-nav__item--active': group === item.group }" :to="{ name: item.name }" :aria-current="group === item.group ? 'true' : undefined">{{ item.label }}</RouterLink>
      </nav>
      <div ref="accountArea" class="account-area">
        <button ref="accountButton" class="app-account sr-glass" type="button" aria-label="账号菜单" :aria-expanded="accountOpen" aria-controls="account-panel" @click="toggleAccount" @keydown.down.prevent="openAccount">
          <span class="app-account__avatar" aria-hidden="true">{{ authStore.isLoggedIn ? (authStore.user?.nickname || authStore.user?.username || '我').slice(0, 1) : '客' }}</span>
          <span class="app-account__label">{{ authStore.isLoggedIn ? '我的' : '账号' }}</span>
          <svg class="app-account__chevron" :class="{ 'is-open': accountOpen }" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m5.5 7.5 4.5 4.5 4.5-4.5" /></svg>
        </button>
        <Transition v-bind="accountMotion"><div v-if="accountOpen" id="account-panel" class="account-panel sr-glass sr-glass--floating" :inert="!accountOpen || undefined" aria-label="账号与偏好">
          <p>{{ authStore.isLoggedIn ? (authStore.user?.nickname || authStore.user?.username) : '本地空间 · 无需登录' }}</p>
          <RouterLink :to="{ name: 'profile' }" @click="closeAccount(false)">个人空间</RouterLink>
          <RouterLink v-if="!isDesktop" to="/download" @click="closeAccount(false)">下载客户端</RouterLink>
          <RouterLink v-if="!authStore.isLoggedIn" :to="{ name: 'login', query: { redirect: route.fullPath } }" @click="closeAccount(false)">登录</RouterLink>
          <RouterLink v-if="authStore.isAdmin" :to="{ name: 'admin' }" @click="closeAccount(false)">管理</RouterLink>
          <button type="button" @click="openAppearance">外观与性能</button>
        </div></Transition>
      </div>
      <AppTitlebar v-if="isDesktop" integrated />
    </div>
    <div v-if="contextItems.length" class="app-chrome__context">
      <nav v-motion-nav class="app-nav app-nav--secondary sr-glass" aria-label="快捷入口">
        <RouterLink v-for="item in contextItems" :key="item.name" class="app-nav__item" :class="{ 'app-nav__item--active': route.name === item.name }" :to="{ name: item.name }" :aria-current="route.name === item.name ? 'page' : undefined">{{ item.label }}</RouterLink>
      </nav>
      <button ref="appearanceButton" class="app-appearance sr-glass" type="button" aria-label="外观与性能" :aria-expanded="drawerOpen" aria-controls="context-drawer" @click="$emit('open-drawer', $event)">外观<span aria-hidden="true"> ···</span></button>
    </div>
  </header>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { featureFlags } from '../../config/features';
import { useAuthStore } from '../../stores/auth';
import { contextNavigation, navigationGroup } from './navigation';
import AppTitlebar from '../window/AppTitlebar.vue';
import { useMotionTransition } from '../../motion/transitions';
const accountMotion = useMotionTransition('menu');
const isDesktop = Boolean(window.studyRoomDesktop);
defineProps<{ drawerOpen: boolean }>();
const emit = defineEmits<{ (event: 'open-drawer', sourceEvent: MouseEvent): void }>();
const route = useRoute();
const authStore = useAuthStore();
const group = computed(() => navigationGroup(route.name));
const primaryItems = computed(() => [
  { name: 'scene', label: '空间', group: 'space' },
  { name: 'feed', label: '社区', group: 'community' },
  ...(featureFlags.entertainment ? [{ name: 'entertainment', label: '片刻放松', group: 'relax' }] : [])
]);
const contextItems = computed(() => contextNavigation(route.name, featureFlags.soundCenter));
const appearanceButton = ref<HTMLButtonElement>();
const accountButton = ref<HTMLButtonElement>();
const accountArea = ref<HTMLElement>();
const accountOpen = ref(false);
async function openAccount() {
  accountOpen.value = true;
  await nextTick();
  if (!accountOpen.value) return;
  const panel = accountArea.value?.querySelector<HTMLElement>('.account-panel');
  if (panel) { panel.inert = false; panel.removeAttribute('aria-hidden'); }
  panel?.querySelector<HTMLElement>('a')?.focus();
}
function closeAccount(restore = true) {
  // v-if retains the outgoing VNode during a leave animation, including its old
  // inert=false prop. Remove it from keyboard/accessibility immediately, not 150ms later.
  const panel = accountArea.value?.querySelector<HTMLElement>('.account-panel');
  if (panel) { panel.inert = true; panel.setAttribute('aria-hidden', 'true'); }
  accountOpen.value = false;
  if (restore) accountButton.value?.focus();
}
function toggleAccount() { if (accountOpen.value) closeAccount(); else void openAccount(); }
function outside(event: PointerEvent) { if (!accountArea.value?.contains(event.target as Node)) closeAccount(false); }
function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeAccount(); } }
function focusOutside(event: FocusEvent) { if (!accountArea.value?.contains(event.target as Node)) closeAccount(false); }
watch(accountOpen, open => {
  if (open) {
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keyboard); document.addEventListener('focusin', focusOutside);
  } else {
    document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); document.removeEventListener('focusin', focusOutside);
  }
});
watch(() => route.fullPath, () => closeAccount(false));
function openAppearance(event: MouseEvent) { emit('open-drawer', event); closeAccount(false); }
onBeforeUnmount(() => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keyboard); document.removeEventListener('focusin', focusOutside); });
defineExpose({ focusAppearance: () => (appearanceButton.value || accountButton.value)?.focus() });
</script>
<style scoped>
.app-chrome{position:relative;z-index:var(--sr-layer-rail);min-width:0;background:transparent;border:0;user-select:none}
.app-chrome--account-open{z-index:calc(var(--sr-layer-drawer) - 1)}
.app-chrome:has(.account-panel){z-index:calc(var(--sr-layer-drawer) - 1)}
/* Keep the account popup above sibling glass controls and the player, but below dialogs. */
.account-area{z-index:1}
.app-chrome__main{display:flex;align-items:center;gap:24px;min-height:60px;padding:6px var(--sr-page-gutter)}
.app-brand{display:flex;align-items:center;gap:10px;flex-shrink:0;text-decoration:none;color:var(--sr-color-text);font-size:15px;letter-spacing:.08em}
.app-brand__icon{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--sr-color-line-strong);border-radius:10px;background:#25372b;font-family:var(--sr-font-display);font-size:18px}
.app-brand strong{font-weight:600}.app-nav{display:flex;align-items:center;gap:4px;min-width:0}
.app-nav__item,.app-appearance,.app-account{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:0;border-radius:var(--sr-radius-control);background:transparent;color:var(--sr-color-text-muted);font-size:14px;font-weight:500;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background-color var(--sr-motion-fast) ease,color var(--sr-motion-fast) ease}
.app-nav__item--active{background:var(--sr-color-selected);color:var(--sr-color-text);font-weight:600}
.app-chrome__context{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px;padding:0 var(--sr-page-gutter) 4px;border-top:1px solid #ffffff06}
.app-nav--secondary .app-nav__item{font-size:13px;padding-inline:18px;background:transparent;border-radius:0;position:relative}
.app-nav--secondary .app-nav__item--active::after{content:'';position:absolute;bottom:0;left:18px;right:18px;height:2px;border-radius:2px;background:var(--sr-color-accent)}
.app-appearance{font-size:12px;padding-inline:12px}.account-area{position:relative;margin-left:auto}.app-account{padding-inline:8px}.app-account__avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#314333;color:var(--sr-color-accent);font-size:12px}
.account-panel{position:absolute;right:0;top:calc(100% + 8px);width:224px;padding:8px;border:1px solid var(--sr-color-line-strong);border-radius:16px;background:var(--sr-color-surface-solid);box-shadow:var(--sr-shadow-raised);transform-origin:top right}
.account-panel p{margin:0;padding:12px 10px;border-bottom:1px solid var(--sr-color-line);color:var(--sr-color-text-muted);font-size:12px;overflow-wrap:anywhere}
.account-panel a,.account-panel button{display:flex;align-items:center;width:100%;min-height:44px;padding:10px;border:0;border-radius:8px;background:none;color:var(--sr-color-text);font-size:14px;text-decoration:none;text-align:left;cursor:pointer}
.app-chrome--desktop .app-chrome__main{-webkit-app-region:drag;padding:4px 6px 4px 20px;gap:20px;min-height:56px}
.app-chrome--desktop :is(a,button,.account-panel,.app-nav){-webkit-app-region:no-drag}
.app-chrome--desktop :deep(.window-chrome){flex-shrink:0}
@media(hover:hover) and (pointer:fine){.app-nav__item:hover,.app-appearance:hover,.app-account:hover,.account-panel a:hover,.account-panel button:hover{background-color:var(--sr-color-hover);color:var(--sr-color-text)}}
.app-nav__item:active,.app-appearance:active,.app-account:active{background-color:#ffffff1f}
@keyframes account-in{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
@media(max-width:600px){.app-chrome__main{gap:8px;padding:4px 12px;min-height:56px}.app-brand strong,.app-account__label{display:none}.app-nav__item{padding-inline:11px;font-size:13px}.app-account{gap:3px;padding-inline:4px}.app-chrome__context{padding-inline:12px}.app-nav--secondary .app-nav__item{padding-inline:16px}.app-nav--primary{gap:2px}}
@media(prefers-reduced-motion:reduce){.account-panel{animation:none}}
.sr-reduced-motion .account-panel{animation:none}

.app-brand__icon{background:linear-gradient(145deg,#ffffff24,#ffffff04);border-color:var(--sr-material-edge);box-shadow:inset 0 1px #ffffff2b;color:var(--sr-color-text)}
.app-nav__item{border-radius:999px}
.app-nav--primary .app-nav__item--active{background:linear-gradient(155deg,#ffffff29,#ffffff08);box-shadow:inset 0 1px #ffffff3b,inset 0 0 0 1px #ffffff29,0 3px 12px #070e1926}
.app-account{gap:8px;padding:4px 10px 4px 5px;border:1px solid #ffffff24;border-radius:999px;background:linear-gradient(150deg,#ffffff16,#ffffff04);box-shadow:inset 0 1px #ffffff1f;transition:background-color 140ms ease,transform 160ms var(--sr-ease-out)}
.app-account__avatar{background:linear-gradient(145deg,#ffffff25,#ffffff09);color:var(--sr-color-text);box-shadow:inset 0 1px #ffffff3b;border:1px solid #ffffff21}
.app-account__chevron{flex:none;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;transition:transform 200ms var(--sr-ease-out);opacity:.85}
.app-account__chevron.is-open{transform:rotate(180deg)}
.app-account[aria-expanded=true]{background-color:#ffffff16;border-color:#ffffff44}
.app-account:active{transform:scale(.98)}
.account-panel{border-radius:22px;padding:8px}
.account-panel a,.account-panel button{border-radius:12px}
.app-chrome__context{border:0;padding-bottom:4px}
.app-nav{padding:3px;border:1px solid var(--sr-material-edge);border-radius:999px}
.app-nav--primary{margin-left:auto}
.account-area{margin-left:0}
.app-nav--secondary .app-nav__item{border-radius:999px}
.app-nav--secondary .app-nav__item--active{background:rgba(255,255,255,.18);box-shadow:inset 0 1px #ffffff38}
.app-nav--secondary .app-nav__item--active::after{display:none}
.app-appearance{border:1px solid var(--sr-material-edge);border-radius:999px}
.app-brand{text-shadow:0 1px 10px #0008}
@media(prefers-reduced-motion:reduce){.app-account,.app-account__chevron{transition:none}.app-account:active{transform:none}}
.sr-reduced-motion .app-account,.sr-reduced-motion .app-account__chevron{transition:none}
.sr-reduced-motion .app-account:active{transform:none}
@media(max-width:600px){.app-account{gap:4px;padding-right:7px}.app-account__chevron{width:16px;height:16px}}
/* Keep native controls and navigation in separate rows on a narrow work area.
   Reuse the existing nodes so window commands and menu focus remain unchanged. */
@media(max-width:800px){
 .app-chrome--desktop .app-chrome__main{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"brand window" "navigation account";gap:4px 8px;padding:4px 12px}
 .app-chrome--desktop .app-brand{grid-area:brand;justify-self:start}
 .app-chrome--desktop .app-brand strong,.app-chrome--desktop .app-account__label{display:inline}
 .app-chrome--desktop .app-nav--primary{grid-area:navigation;justify-self:start;margin-left:0}
 .app-chrome--desktop .account-area{grid-area:account;justify-self:end}
 .app-chrome--desktop :deep(.window-chrome){grid-area:window;justify-self:end}
}
</style>
