<template>
  <section class="profile-panel" aria-labelledby="cloud-account-title">
    <header class="profile-section-head"><div><p>CLOUD ACCOUNT</p><h1 id="cloud-account-title">云端账号</h1></div><span>{{ roleText }}</span></header>
    <div v-if="error" class="profile-state error" role="alert">{{ error }}<button type="button" @click="$emit('retry')">重试</button></div>
    <div v-else-if="loading && !account" class="profile-state" role="status">正在加载账号资料…</div>
    <template v-else-if="account">
      <div class="profile-identity-card">
        <label class="profile-avatar-upload">
          <img v-if="avatarUrl" :src="avatarUrl" alt="用户头像" /><span v-else>{{ avatarText }}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" :disabled="saving" @change="selectAvatar" />
          <small>更换头像</small>
        </label>
        <div><p>StudyRoom ID</p><h2>SR-{{ String(account.id).padStart(8, "0") }}</h2><span>@{{ account.username }} · {{ account.createdAt || "注册时间暂未记录" }}</span></div>
      </div>
      <form class="profile-form" @submit.prevent="saveNickname">
        <label for="profile-nickname">昵称</label>
        <div><input id="profile-nickname" v-model.trim="nickname" minlength="2" maxlength="20" /><button type="submit" :disabled="saving">保存昵称</button></div>
      </form>
      <p v-if="message" class="profile-message" :role="failed ? 'alert' : 'status'">{{ message }}</p>
      <div class="profile-note"><strong>云端资料范围</strong><p>头像、昵称、专注统计、日历、动态和反馈与账号关联；本地歌曲与第三方平台凭据不会上传。</p></div>
      <button class="profile-danger" type="button" @click="$emit('logout')">退出云端账号</button>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { cloudMediaUrl } from "../../utils/cloudMedia";
import type { ProfileDetails } from "../../services/profile";

const props = defineProps<{ account: ProfileDetails | null; loading: boolean; error?: string }>();
const emit = defineEmits<{ retry: []; nickname: [value: string, done: (error?: string) => void]; avatar: [file: File, done: (error?: string) => void]; logout: [] }>();
const nickname = ref("");
const saving = ref(false);
const message = ref("");
const failed = ref(false);
let generation = 0;
onBeforeUnmount(() => { generation++; });
watch(() => props.account?.id, () => { generation++; saving.value = false; message.value = ''; });
watch(() => props.account?.nickname, (value) => { nickname.value = value || ""; }, { immediate: true });
const avatarText = computed(() => String(props.account?.nickname || props.account?.username || "S").slice(0, 1).toUpperCase());
const avatarUrl = computed(() => cloudMediaUrl(props.account?.avatarUrl));
const roleText = computed(() => ({ ADMIN: "管理员", BANNED: "封禁账号", MUTED: "禁言账号", NORMAL: "圈内成员" }[String(props.account?.userType || "NORMAL").toUpperCase()] || "圈内成员"));
async function saveNickname() {
  if (nickname.value.length < 2 || nickname.value.length > 20 || saving.value) return;
  saving.value = true; message.value = "";
  const current = generation;
  emit('nickname', nickname.value, error => {
    if (current !== generation) return;
    saving.value = false; failed.value = Boolean(error); message.value = error || '昵称已保存。';
  });
}
function selectAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = "";
  if (!file || saving.value) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    message.value = "头像仅支持 2MB 以内的 JPG、PNG 或 WebP。"; return;
  }
  saving.value = true; message.value = ''; const current = generation;
  emit('avatar', file, error => {
    if (current !== generation) return;
    saving.value = false; failed.value = Boolean(error); message.value = error || '头像已保存。';
  });
}
</script>
