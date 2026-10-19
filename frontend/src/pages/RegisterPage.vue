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
      <button class="pill" type="button" @click="goLogin">已有账号</button>
    </div>

    <section class="page" data-motion-group>
      <div class="hero">
        <div class="kicker">CREATE · ROOM · RHYTHM</div>
        <h1>建立你的<br />学习节奏</h1>
        <p class="copy">
          创建账号后，后续可以保存你的场景偏好、动态历史、专注统计和每日学习记录。
        </p>
      </div>

      <form class="register-card sr-glass sr-glass--floating" novalidate :class="{ shake: isShaking }" @submit.prevent="submitRegister">
        <div class="card-head">
          <h2>注册</h2>
          <span>New Account</span>
        </div>

        <AuthField
          id="register-invitation"
          :disabled="isSubmitting || created || unconfirmed"
          ref="invitationField"
          v-model="form.invitationCode"
          label="邀请码"
          autocomplete="off"
          maxlength="128"
          placeholder="输入圈内邀请提供的邀请码"
          :error="fieldErrors.invitationCode"
        />

        <AuthField
          id="register-username"
          :disabled="isSubmitting || created || unconfirmed"
          ref="usernameField"
          :model-value="form.username"
          label="用户名"
          autocomplete="username"
          inputmode="latin"
          maxlength="32"
          pattern="[A-Za-z0-9_\-]{2,32}"
          placeholder="设置用户名"
          :error="fieldErrors.username"
          @update:model-value="setUsername"
        />

        <PasswordField
          id="register-password"
          :disabled="isSubmitting || created || unconfirmed"
          ref="passwordField"
          v-model="form.password"
          label="密码"
          autocomplete="new-password"
          placeholder="8-64 位，建议使用长密码短语"
          :error="fieldErrors.password"
        />

        <PasswordField
          id="register-confirm-password"
          :disabled="isSubmitting || created || unconfirmed"
          ref="confirmPasswordField"
          v-model="form.confirmPassword"
          label="确认密码"
          autocomplete="new-password"
          placeholder="再次输入密码"
          :error="fieldErrors.confirmPassword"
        />

        <AuthStatus :message="message" :retry-until="retryUntil" />

        <button class="submit" type="submit" :disabled="isSubmitting || isLeaving || remaining > 0">
          {{ isSubmitting ? "处理中..." : created || unconfirmed ? "前往登录核对" : "创建墨屿账号" }}
        </button>

        <div class="switch-line">
          <span>已经有账号？</span>
          <button type="button" @click="goLogin">去登录</button>
        </div>
      </form>
    </section>
  </main>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import AuthField from "./auth/AuthField.vue";
import PasswordField from "./auth/PasswordField.vue";
import AuthStatus from "./auth/AuthStatus.vue";
import { useAuthSubmission } from './auth/useAuthSubmission';
import { newPasswordError } from '../services/passwordPolicy';
import { isUnknownWriteOutcome } from '../services/writeOutcome';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const form = reactive({
  invitationCode: "",
  username: "",
  password: "",
  confirmPassword: ""
});
const fieldErrors = reactive({ invitationCode: "", username: "", password: "", confirmPassword: "" });
const isLeaving = ref(false);
const isShaking = ref(false);
const { pending: isSubmitting, retryUntil, remaining, begin, rateLimit, isAlive } = useAuthSubmission();
const created = ref(false);
const unconfirmed = ref(false);
const message = ref("");
const invitationField = ref<{ focus: () => void } | null>(null);
const usernameField = ref<{ focus: () => void } | null>(null);
const passwordField = ref<{ focus: () => void } | null>(null);
const confirmPasswordField = ref<{ focus: () => void } | null>(null);
const usernamePattern = /^[A-Za-z0-9_-]{2,32}$/;
const usernameHint = "用户名只能包含英文、数字、下划线或短横线，长度 2-32 位。";

function setUsername(value: string) {
  form.username = value;
  fieldErrors.username = "";
}

function shake(text: string) {
  message.value = text;
  isShaking.value = false;
}

async function navigateWithCurtain(target: Parameters<typeof router.push>[0]) {
  if (isLeaving.value) return;
  isLeaving.value = true;
  clearSecrets();
  try {
    const failure = await router.push(target);
    if (failure && isAlive()) { isLeaving.value = false; message.value = '页面跳转未完成，请重试。'; }
  } catch {
    if (isAlive()) { isLeaving.value = false; message.value = '页面加载失败，请重试。'; }
  }
}

function redirectTarget() {
  const redirect = String(route.query.redirect || "scene");
  const allowed = new Set(["scene", "profile", "focus", "admin", "chat", "feed", "sound", "entertainment"]);
  if (redirect.startsWith("/")) {
    const resolved = router.resolve(redirect);
    if (allowed.has(String(resolved.name || ""))) return { path: resolved.fullPath };
  }
  return { name: allowed.has(redirect) ? redirect : "scene" };
}

async function submitRegister() {
  if (isSubmitting.value || isLeaving.value || remaining.value) return;
  if (created.value || unconfirmed.value) { await goLogin(); return; }
  Object.assign(fieldErrors, { invitationCode: "", username: "", password: "", confirmPassword: "" });
  message.value = '';
  if (!form.invitationCode.trim()) {
    fieldErrors.invitationCode = "请输入邀请码。";
    await nextTick();
    invitationField.value?.focus();
    return;
  }
  if (!form.username) {
    fieldErrors.username = "请输入用户名。";
    await nextTick();
    usernameField.value?.focus();
    return;
  }
  if (!usernamePattern.test(form.username)) {
    fieldErrors.username = usernameHint;
    await nextTick();
    usernameField.value?.focus();
    return;
  }
  if (newPasswordError(form.password)) {
    fieldErrors.password = newPasswordError(form.password);
    await nextTick();
    passwordField.value?.focus();
    return;
  }
  if (form.password !== form.confirmPassword) {
    fieldErrors.confirmPassword = "两次输入的密码不一致。";
    await nextTick();
    confirmPasswordField.value?.focus();
    return;
  }
  if (!begin()) return;
  message.value = "";
  const generation = authStore.sessionGeneration;
  const username = form.username;
  let password = form.password;
  try {
    await authStore.register({
      username,
      password,
      nickname: username,
      invitationCode: form.invitationCode.trim()
    });
    if (!isAlive() || isLeaving.value || generation !== authStore.sessionGeneration) return;
    created.value = true;
    clearSecrets();
    await authStore.login({
      username,
      password,
      rememberMe: false
    });
    if (!isAlive() || isLeaving.value) return;
    await navigateWithCurtain(redirectTarget());
  } catch (error: any) {
    if (!isAlive() || isLeaving.value) return;
    rateLimit(error?.retryAfter);
    if (created.value) {
      clearSecrets(); message.value = '账号已创建，但自动登录未完成。请前往登录，不要重复注册。'; return;
    }
    if (generation !== authStore.sessionGeneration) { clearSecrets(); return; }
    if (isUnknownWriteOutcome(error)) {
      unconfirmed.value = true; clearSecrets();
      message.value = '注册结果尚未确认，账号可能已创建。请先前往登录核对，不要重复提交邀请码。'; return;
    }
    const invitationErrors = new Set(["INVITATION_REQUIRED", "INVITATION_INVALID", "INVITATION_EXPIRED", "INVITATION_EXHAUSTED", "INVITATION_DISABLED"]);
    if (invitationErrors.has(error?.code)) {
      fieldErrors.invitationCode = error?.message || "邀请码不可用。";
      await nextTick();
      invitationField.value?.focus();
    } else if (error?.code === "AUTH_USERNAME_TAKEN") {
      fieldErrors.username = error?.message || "用户名已被使用。";
      await nextTick();
      usernameField.value?.focus();
    } else if (error?.code === "PASSWORD_POLICY_VIOLATION") {
      fieldErrors.password = error?.message || "密码不符合安全要求。";
      await nextTick();
      passwordField.value?.focus();
    } else {
      await nextTick();
      invitationField.value?.focus();
    }
    if (!Object.values(fieldErrors).some(Boolean)) shake(error?.message || '暂时无法注册，请稍后再试。');
  } finally {
    password = '';
    if (isAlive()) isSubmitting.value = false;
  }
}

function goHome() {
  navigateWithCurtain({ name: "welcome" });
}

function goLogin() {
  return navigateWithCurtain({ name: "login", query: { redirect: route.query.redirect || "scene", username: form.username } });
}
function clearSecrets() { form.password = ''; form.confirmPassword = ''; form.invitationCode = ''; }
onBeforeUnmount(clearSecrets);
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
    linear-gradient(90deg, rgba(0, 0, 0, .56), rgba(0, 0, 0, .12) 48%, rgba(0, 0, 0, .4)),
    linear-gradient(180deg, rgba(0, 0, 0, .24), rgba(0, 0, 0, .06) 44%, rgba(0, 0, 0, .56)),
    url("../assets/images/auth/register-bg.jpg") center / cover no-repeat;
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
  max-width: 700px;
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
  max-width: 570px;
  margin: 26px 0 0;
  color: rgba(255, 255, 255, .78);
  font-size: 15px;
  line-height: 1.85;
  font-weight: 700;
}

.register-card {
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

.register-card.shake {
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

  .register-card {
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
  .register-card,
  .register-card.shake {
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

