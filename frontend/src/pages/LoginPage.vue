<template>
  <main class="auth-page" :class="{ leaving: isLeaving }">
    <div class="bg"></div>

    <button class="brand" type="button" @click="goHome">
      <span class="brand-icon" aria-hidden="true">
        <BrandMark />
      </span>
      <span>墨屿自习室</span>
    </button>

    <div class="top-actions">
      <button class="pill" type="button" @click="goScene">先去选场景</button>
    </div>

    <section class="page" data-motion-group>
      <div class="hero">
        <div class="kicker">RETURN · FOCUS · CONTINUE</div>
        <h1>回到你的<br />自习室</h1>
        <p class="copy">
          登录后继续保留你的专注节奏、场景偏好和学习记录。先把自己放回安静的位置，再开始今天的时间。
        </p>
      </div>

      <form class="login-card sr-glass sr-glass--floating" novalidate :class="{ shake: isShaking }" @submit.prevent="submitLogin">
        <div class="card-head">
          <h2>登录</h2>
          <span>Account</span>
        </div>

        <AuthField
          id="login-username"
          :disabled="isSubmitting"
          ref="usernameField"
          :model-value="form.username"
          label="用户名"
          autocomplete="username"
          inputmode="latin"
          maxlength="32"
          pattern="[A-Za-z0-9_\-]{2,32}"
          placeholder="请输入用户名"
          :error="fieldErrors.username"
          @update:model-value="setUsername"
        />

        <PasswordField
          id="login-password"
          :disabled="isSubmitting"
          ref="passwordField"
          v-model="form.password"
          label="密码"
          autocomplete="current-password"
          placeholder="请输入密码"
          :error="fieldErrors.password"
        />

        <button v-if="isDesktop" class="auto-login" :class="{ active: rememberMe }" type="button" role="switch" :aria-checked="rememberMe" @click="rememberMe = !rememberMe">
          <span class="auto-switch" aria-hidden="true"><i></i></span>
          <strong>保持登录 30 天</strong>
        </button>

        <AuthStatus :message="statusMessage" :retry-until="retryUntil" />
        <button v-if="authStore.sessionCheckError" class="auto-login" type="button" :disabled="checkingSession || isSubmitting" @click="retrySession">
          {{ checkingSession ? '正在确认原登录…' : '重新确认原登录（不提交密码）' }}
        </button>

        <button class="submit" type="submit" :disabled="isSubmitting || isLeaving || remaining > 0">
          {{ isSubmitting ? "登录中..." : signedIn ? "继续进入墨屿" : "进入墨屿" }}
        </button>

        <div class="switch-line">
          <span>还没有账号？</span>
          <button type="button" @click="goRegister">创建一个</button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import AuthField from "./auth/AuthField.vue";
import PasswordField from "./auth/PasswordField.vue";
import AuthStatus from "./auth/AuthStatus.vue";
import { useAuthSubmission } from './auth/useAuthSubmission';
import { isUnknownWriteOutcome } from '../services/writeOutcome';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const form = reactive({
  username: String(route.query.username || ""),
  password: ""
});
const fieldErrors = reactive({ username: "", password: "" });
const isLeaving = ref(false);
const isShaking = ref(false);
const { pending: isSubmitting, retryUntil, remaining, begin, rateLimit, isAlive } = useAuthSubmission();
const signedIn = ref(false);
const checkingSession = ref(false);
const message = ref("");
const rememberMe = ref(false);
const isDesktop = computed(() => Boolean(window.studyRoomDesktop));
const usernameField = ref<{ focus: () => void } | null>(null);
const passwordField = ref<{ focus: () => void } | null>(null);
const usernamePattern = /^[A-Za-z0-9_-]{2,32}$/;
const usernameHint = "用户名只能包含英文、数字、下划线或短横线，长度 2-32 位。";
const routeReasonMessage = computed(() => {
  if (route.query.reason === "logged-in-elsewhere") return "你的账号已在其他地方登录，云端功能需要重新登录。";
  if (route.query.reason === "session-ended") return "登录已过期，请重新登录后继续使用云端功能。";
  return "";
});
// Field feedback owns its message; do not repeat it in the form's live region.
const statusMessage = computed(() => {
  const errors = Object.values(fieldErrors).filter(Boolean);
  if (message.value) return errors.includes(message.value) ? '' : message.value;
  return errors.length ? '' : authStore.sessionCheckError || routeReasonMessage.value;
});

async function retrySession() {
  if (checkingSession.value || isSubmitting.value) return;
  checkingSession.value=true;
  try {
    await authStore.loadCurrentUser();
    if (isAlive() && authStore.isLoggedIn && !authStore.sessionCheckError) await navigateWithCurtain(redirectTarget());
  } finally { checkingSession.value=false; }
}

function setUsername(value: string) {
  form.username = value;
  signedIn.value = false;
  fieldErrors.username = "";
}

function shake(text: string) {
  message.value = text;
  isShaking.value = false;
}

async function navigateWithCurtain(target: Parameters<typeof router.push>[0]) {
  if (isLeaving.value) return;
  isLeaving.value = true;
  form.password = '';
  try {
    const failure = await router.push(target);
    if (failure && isAlive()) { isLeaving.value = false; message.value = '页面跳转未完成，请重试进入。'; }
  } catch {
    if (isAlive()) { isLeaving.value = false; message.value = '页面加载失败，请重试进入。'; }
  }
}

function redirectTarget() {
  const redirect = String(route.query.redirect || sessionStorage.getItem("studyroom-post-login-target") || "scene");
  const allowed = new Set(["scene", "profile", "focus", "admin", "chat", "feed", "sound", "entertainment", "download"]);
  if (redirect.startsWith("/")) {
    const resolved = router.resolve(redirect);
    if (allowed.has(String(resolved.name || ""))) {
      sessionStorage.removeItem("studyroom-post-login-target");
      return { path: resolved.fullPath };
    }
  }
  sessionStorage.removeItem("studyroom-post-login-target");
  return { name: allowed.has(redirect) ? redirect : "scene" };
}

async function submitLogin() {
  if (isSubmitting.value || checkingSession.value || isLeaving.value || remaining.value) return;
  if (signedIn.value && authStore.user?.username === form.username) {
    await navigateWithCurtain(redirectTarget()); return;
  }
  fieldErrors.username = "";
  fieldErrors.password = "";
  message.value = '';
  if (!form.username) {
    fieldErrors.username = "请输入用户名。";
    await nextTick();
    usernameField.value?.focus();
    return;
  }
  if (!form.password) {
    fieldErrors.password = "请输入密码。";
    await nextTick();
    passwordField.value?.focus();
    return;
  }
  if (!usernamePattern.test(form.username)) {
    fieldErrors.username = usernameHint;
    await nextTick();
    usernameField.value?.focus();
    return;
  }
  if (!begin()) return;
  message.value = "";
  try {
    await authStore.login({
      username: form.username,
      password: form.password,
      rememberMe: isDesktop.value && rememberMe.value
    });
    if (!isAlive() || isLeaving.value) return;
    signedIn.value = true;
    form.password = '';
    if (authStore.isBanned) {
      await navigateWithCurtain({ name: "banned" });
      return;
    }
    if (authStore.passwordChangeRequired) {
      await navigateWithCurtain({ name: "profile", query: { module: "security", reason: "password-change-required" } });
      return;
    }
    await navigateWithCurtain(redirectTarget());
  } catch (error: any) {
    if (!isAlive() || isLeaving.value) return;
    rateLimit(error?.retryAfter);
    if (error?.code === "AUTH_INVALID_CREDENTIALS") {
      fieldErrors.password = "用户名或密码不正确。";
      message.value = '';
    } else {
      shake(isUnknownWriteOutcome(error) ? '登录结果尚未确认，未重复提交。请稍后重新登录。' : error?.message || '暂时无法登录，请稍后再试。');
    }
    // Enable the input before restoring focus; disabled inputs cannot receive it.
    isSubmitting.value = false;
    await nextTick();
    passwordField.value?.focus();
  } finally {
    if (isAlive()) isSubmitting.value = false;
  }
}

function goHome() {
  navigateWithCurtain({ name: "welcome" });
}

function goScene() {
  navigateWithCurtain({ name: "scene" });
}

function goRegister() {
  navigateWithCurtain({ name: "register", query: { redirect: route.query.redirect || "scene" } });
}
onBeforeUnmount(() => { form.password = ''; });
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  overflow: hidden;
  background: #101318;
  color: #fff;
}

.bg {
  position: fixed;
  inset: 0;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, .54), rgba(0, 0, 0, .1) 48%, rgba(0, 0, 0, .38)),
    linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .06) 44%, rgba(0, 0, 0, .54)),
    url("../assets/images/auth/login-bg.jpg") center / cover no-repeat;
  transform: scale(1.02);
  animation: bgIn 1100ms cubic-bezier(.22, 1, .36, 1) both;
  transition:
    filter 520ms ease,
    transform 700ms cubic-bezier(.22, 1, .36, 1);
}

.auth-page.leaving .bg {
  filter: blur(5px) saturate(.9);
  transform: scale(1.045);
}

.page {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(420px, 1fr) minmax(340px, 430px);
  gap: 48px;
  align-items: center;
  padding: 36px 52px 44px;
  transition:
    opacity 420ms ease,
    transform 580ms cubic-bezier(.22, 1, .36, 1),
    filter 480ms ease;
}

.auth-page.leaving .page {
  opacity: 0;
  transform: translateY(12px) scale(.985);
  filter: blur(2px);
  pointer-events: none;
}

.brand {
  position: fixed;
  top: 36px;
  left: 52px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, .92);
  font-weight: 900;
  cursor: pointer;
}

.brand-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 12px;
  background: rgba(255, 255, 255, .1);
  backdrop-filter: blur(18px);
}

.brand-icon svg {
  width: 23px;
  height: 23px;
}

.top-actions {
  position: fixed;
  top: 36px;
  right: 52px;
  z-index: 2;
}

.pill {
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 999px;
  background: rgba(20, 24, 26, .32);
  color: rgba(255, 255, 255, .86);
  backdrop-filter: blur(18px);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
  transition:
    background 220ms ease,
    transform 220ms cubic-bezier(.22, 1, .36, 1);
}

.pill:hover {
  background: rgba(255, 255, 255, .13);
  transform: translateY(-1px);
}

.hero {
  max-width: 680px;
  padding-top: 70px;
}

.kicker {
  margin-bottom: 28px;
  color: rgba(255, 255, 255, .76);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: .14em;
}

h1 {
  margin: 0;
  color: #fff;
  font-size: clamp(58px, 8vw, 112px);
  line-height: .94;
  letter-spacing: 0;
  font-weight: 950;
}

.copy {
  max-width: 560px;
  margin: 26px 0 0;
  color: rgba(255, 255, 255, .78);
  font-size: 15px;
  line-height: 1.85;
  font-weight: 700;
}

.login-card {
  justify-self: end;
  width: min(430px, 100%);
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 28px;
  background: rgba(28, 34, 36, .44);
  backdrop-filter: blur(28px);
  box-shadow: 0 28px 100px rgba(0, 0, 0, .34);
  animation: cardIn 760ms cubic-bezier(.22, 1, .36, 1) 120ms both;
}

.login-card.shake {
  animation: shake 360ms ease both;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 22px;
}

.card-head h2 {
  margin: 0;
  font-size: 26px;
  line-height: 1.15;
  font-weight: 950;
}

.card-head span {
  color: rgba(255, 255, 255, .56);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
}

.field span {
  color: rgba(255, 255, 255, .66);
  font-size: 12px;
  font-weight: 900;
}

.field input {
  width: 100%;
  height: 48px;
  padding: 0 15px;
  border: 1px solid rgba(255, 255, 255, .14);
  border-radius: 16px;
  outline: 0;
  background: rgba(255, 255, 255, .08);
  color: #fff;
  font-size: 14px;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;
}

.field input:focus {
  border-color: rgba(255, 255, 255, .38);
  background: rgba(255, 255, 255, .12);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, .08);
}

.auto-login {
  width: 100%;
  height: 44px;
  margin: 2px 0 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 16px;
  background: rgba(255, 255, 255, .07);
  color: rgba(255, 255, 255, .72);
  cursor: pointer;
  transition:
    border-color 220ms ease,
    background 220ms ease,
    transform 220ms cubic-bezier(.22, 1, .36, 1),
    color 220ms ease;
}

.auto-login:hover {
  border-color: rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .1);
  transform: translateY(-1px);
}

.auto-login.active {
  border-color: rgba(255, 255, 255, .24);
  background: rgba(255, 255, 255, .14);
  color: #fff;
}

.auto-switch {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .2);
  transition: background 240ms ease;
}

.auto-switch i {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(255, 255, 255, .9);
  transition:
    transform 260ms cubic-bezier(.22, 1, .36, 1),
    background 240ms ease;
}

.auto-login.active .auto-switch {
  background: rgba(255, 255, 255, .86);
}

.auto-login.active .auto-switch i {
  transform: translateX(18px);
  background: #15181b;
}

.auto-login strong {
  font-size: 12px;
  font-weight: 950;
}

.message {
  min-height: 20px;
  margin: 2px 0 14px;
  color: rgba(255, 226, 196, .94);
  font-size: 12px;
  font-weight: 800;
}

.submit {
  width: 100%;
  min-height: 52px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, .94);
  color: #12161a;
  font-weight: 950;
  cursor: pointer;
  transition:
    transform 220ms cubic-bezier(.22, 1, .36, 1),
    background 220ms ease,
    opacity 220ms ease;
}

.submit:hover:not(:disabled) {
  background: #fff;
  transform: translateY(-1px);
}

.submit:disabled {
  opacity: .72;
  cursor: default;
}

.switch-line {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
  color: rgba(255, 255, 255, .64);
  font-size: 13px;
  font-weight: 800;
}

.switch-line button {
  border: 0;
  background: transparent;
  color: #fff;
  font-weight: 950;
  cursor: pointer;
}

@keyframes bgIn {
  from { opacity: 0; transform: scale(1.04); }
  to { opacity: 1; transform: scale(1.02); }
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(18px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  22% { transform: translateX(-8px); }
  44% { transform: translateX(7px); }
  66% { transform: translateX(-5px); }
  82% { transform: translateX(3px); }
}

@media (max-width: 860px) {
  .auth-page { overflow-y: auto; }

  .page {
    grid-template-columns: 1fr;
    padding: 92px 24px 28px;
  }

  .hero {
    display: none;
  }

  .login-card {
    justify-self: center;
  }

  .brand {
    top: 24px;
    left: 24px;
  }

  .top-actions {
    top: 24px;
    right: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bg,
  .page,
  .login-card,
  .login-card.shake {
    animation: none;
    transition-duration: 1ms;
  }

  .auth-page.leaving .bg,
  .auth-page.leaving .page {
    filter: none;
    transform: none;
  }
}
</style>
<style scoped src="./auth/auth-polish.css"></style>

