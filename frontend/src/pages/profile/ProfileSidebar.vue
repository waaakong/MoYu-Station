<template>
  <aside class="profile-rail glass sr-glass" aria-label="个人中心模块">
    <div class="profile-rail-head">
      <span class="profile-avatar">{{ avatarText }}</span>
      <div>
        <strong>{{ displayName }}</strong>
        <small>{{ authenticated ? roleText : "本地访客" }}</small>
      </div>
    </div>
    <div class="profile-module-list">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        :class="{ active: item.key === active }"
        :aria-current="item.key === active ? 'page' : undefined"
        @click="$emit('select', item.key)"
      >
        <strong>{{ item.label }}</strong><span>{{ item.description }}</span>
      </button>
    </div>
    <button v-if="!authenticated" class="profile-login" type="button" @click="$emit('login')">登录云端账号</button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ProfileDetails } from "../../services/profile";

export interface ProfileModuleItem { key: string; label: string; description: string }

const props = defineProps<{ active: string; authenticated: boolean; account: ProfileDetails | null; items: ProfileModuleItem[] }>();
defineEmits<{ select: [key: string]; login: [] }>();

const displayName = computed(() => props.account?.nickname || props.account?.username || "我的空间");
const avatarText = computed(() => displayName.value.slice(0, 1).toUpperCase());
const roleText = computed(() => ({ ADMIN: "管理员", BANNED: "封禁账号", MUTED: "禁言账号", NORMAL: "圈内成员" }[String(props.account?.userType || "NORMAL").toUpperCase()] || "圈内成员"));
</script>
