<template>
  <main class="banned-page">
    <div class="bg"></div>
    <section class="panel sr-glass sr-glass--reading">
      <div class="mark">!</div>
      <p class="eyebrow">ACCOUNT RESTRICTED</p>
      <h1>账号云端功能已停用</h1>
      <p class="copy">
        聊天、动态、同步与账号管理等云端功能暂不可用；本机场景、声音、专注计时和娱乐工具仍可继续使用。
        如需恢复账号，请联系管理员处理。
      </p>
      <nav class="local-links" aria-label="仍可使用的本地功能">
        <RouterLink :to="{ name: 'scene' }">场景</RouterLink>
        <RouterLink :to="{ name: 'sound' }">声音</RouterLink>
        <RouterLink :to="{ name: 'focus' }">专注</RouterLink>
        <RouterLink :to="{ name: 'entertainment' }">娱乐</RouterLink>
      </nav>
      <div class="actions">
        <button type="button" :disabled="pending" @click="backToLogin">{{ pending ? '正在退出…' : '返回登录' }}</button>
        <button class="ghost" type="button" @click="goHome">返回本地空间</button>
      </div>
      <p v-if="message" role="alert">{{ message }}</p>
    </section>
  </main>
</template>

<script setup>
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { ref, onBeforeUnmount } from 'vue';

const router = useRouter();
const authStore = useAuthStore();
const pending = ref(false), message = ref('');
let alive = true, expectedGeneration = authStore.sessionGeneration;
onBeforeUnmount(() => { alive = false; });

async function backToLogin() {
  if (pending.value) return;
  if (expectedGeneration !== authStore.sessionGeneration) { message.value = '账号状态已变化，请返回本地空间核对。'; return; }
  pending.value = true; message.value = '';
  try {
    const operation = authStore.logout();
    expectedGeneration = authStore.sessionGeneration;
    await operation;
    if (!alive || expectedGeneration !== authStore.sessionGeneration) return;
    const failure = await router.push({ name: 'login' });
    if (failure && alive) message.value = '已退出，但页面跳转未完成。请重试。';
  } catch {
    if (alive && expectedGeneration === authStore.sessionGeneration) message.value = '退出未确认，私人内容已隐藏。请重试退出，或继续使用本地空间。';
  } finally { if (alive) pending.value = false; }
}

function goHome() {
  router.push({ name: "scene" });
}
</script>

<style scoped>
.banned-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 24px;
  background: #101318;
  color: #fff;
}

.bg {
  position: fixed;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, .58), rgba(0, 0, 0, .16), rgba(0, 0, 0, .52)),
    linear-gradient(180deg, rgba(0, 0, 0, .18), rgba(0, 0, 0, .62)),
    url("../assets/images/auth/login-bg.jpg") center / cover no-repeat;
  transform: scale(1.02);
  filter: saturate(.88);
}

.panel {
  position: relative;
  z-index: 1;
  width: min(520px, calc(100vw - 48px));
  padding: 34px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 30px;
  background: rgba(28, 34, 36, .46);
  backdrop-filter: blur(28px);
  box-shadow: 0 28px 100px rgba(0, 0, 0, .34);
  text-align: center;
  animation: panelIn 760ms cubic-bezier(.22, 1, .36, 1) both;
}

.mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin: 0 auto 18px;
  border: 1px solid rgba(255, 255, 255, .2);
  border-radius: 18px;
  background: rgba(255, 255, 255, .12);
  font-size: 28px;
  font-weight: 950;
}

.eyebrow {
  margin: 0 0 12px;
  color: rgba(255, 255, 255, .58);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .14em;
}

h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1.15;
}

.copy {
  margin: 18px auto 0;
  max-width: 420px;
  color: rgba(255, 255, 255, .76);
  font-size: 14px;
  line-height: 1.9;
  font-weight: 700;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 26px;
}

.local-links { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 24px; }
.local-links a { display: grid; place-items: center; min-height: 42px; border: 1px solid rgba(255,255,255,.14); border-radius: 14px; background: rgba(255,255,255,.08); color: #fff; font-size: 12px; font-weight: 900; text-decoration: none; transition: background 180ms ease, transform 180ms ease; }
.local-links a:hover { background: rgba(255,255,255,.14); transform: translateY(-1px); }

button {
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, .94);
  color: #12161a;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 220ms cubic-bezier(.22, 1, .36, 1),
    background 220ms ease;
}

button:hover {
  background: #fff;
  transform: translateY(-1px);
}

button.ghost {
  border: 1px solid rgba(255, 255, 255, .16);
  background: rgba(255, 255, 255, .1);
  color: #fff;
}

@keyframes panelIn {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
<style scoped>
.banned-page { position:relative; isolation:isolate; min-height:100dvh; color:var(--sr-color-text); }
.standalone-desktop .banned-page { min-height:0; height:100%; }
.panel { width:min(560px,100%); border-radius:var(--sr-radius-panel); background:var(--sr-color-surface); border-color:var(--sr-color-line); animation:none; padding:clamp(24px,4vw,36px); }
.bg { position:absolute; pointer-events:none; transform:none; }
h1 { font-size:clamp(24px,3vw,30px); line-height:1.3; font-weight:650; text-wrap:balance; }
.copy { font-weight:400; color:var(--sr-color-text-muted); line-height:1.8; }
button,.local-links a { min-height:44px; border-radius:var(--sr-radius-control); font-weight:600; transition:background-color var(--sr-motion-fast) ease; }
button:hover,.local-links a:hover { transform:none; }
.actions { flex-wrap:wrap; }
button { flex:1; white-space:nowrap; }
@media(max-width:430px) { .local-links { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(prefers-reduced-transparency:reduce) { .panel { background:var(--sr-color-surface-solid); backdrop-filter:none; } }
.sr-reduced-transparency .panel { background:var(--sr-color-surface-solid); backdrop-filter:none; }
</style>
