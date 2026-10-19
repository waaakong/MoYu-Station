<template>
  <section class="profile-panel" aria-labelledby="profile-security-title">
    <header class="profile-section-head"><div><p>ACCOUNT SECURITY</p><h1 id="profile-security-title">修改密码</h1></div><span v-if="required" class="warning">必须完成</span></header>
    <div v-if="required" class="profile-state warning" role="alert">当前密码必须更新后才能继续使用云端功能。本机场景、声音、专注和娱乐仍可使用。</div>
    <form class="profile-feedback-form" @submit.prevent="submit">
      <label for="current-password">当前密码</label><input id="current-password" v-model="oldPassword" type="password" autocomplete="current-password" required />
      <label for="new-password">新密码</label><input id="new-password" v-model="newPassword" type="password" autocomplete="new-password" maxlength="128" required />
      <label for="confirm-password">确认新密码</label><input id="confirm-password" v-model="confirmPassword" type="password" autocomplete="new-password" maxlength="128" required />
      <p v-if="message" class="profile-message" :role="failed ? 'alert' : 'status'">{{ message }}</p>
      <button type="submit" :disabled="saving">{{ saving ? "修改中…" : "确认修改密码" }}</button>
    </form>
    <div class="profile-note"><strong>会话保护</strong><p>修改成功后其他旧会话失效，当前会话刷新为最新账号状态。</p></div>
  </section>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";
import { newPasswordError } from '../../services/passwordPolicy';
defineProps<{ required: boolean }>();
const emit = defineEmits<{ change: [payload: { oldPassword: string; newPassword: string }, done: (error?: string) => void] }>();
const oldPassword = ref(""); const newPassword = ref(""); const confirmPassword = ref(""); const message = ref(""); const failed = ref(false); const saving = ref(false);
let alive = true;
onBeforeUnmount(() => { alive = false; oldPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''; });
function submit() {
  if (saving.value) return;
  failed.value = true;
  if (!oldPassword.value) { message.value = "请输入当前密码。"; return; }
  if (newPasswordError(newPassword.value)) { message.value = newPasswordError(newPassword.value); return; }
  if (oldPassword.value === newPassword.value) { message.value = "新密码不能和当前密码相同。"; return; }
  if (newPassword.value !== confirmPassword.value) { message.value = "两次输入的新密码不一致。"; return; }
  saving.value = true; message.value = "";
  emit("change", { oldPassword: oldPassword.value, newPassword: newPassword.value }, (error) => {
    if (!alive) return;
    saving.value = false; failed.value = Boolean(error); message.value = error || "密码修改成功。";
    if (!error) { oldPassword.value = ""; newPassword.value = ""; confirmPassword.value = ""; }
  });
}
</script>
