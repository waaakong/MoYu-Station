<template>
  <main class="profile-page" :style="frameStyle">
    <div class="profile-background" :style="backgroundStyle"></div><div class="profile-shade"></div>
    <header class="profile-topbar"><nav aria-label="主导航"><button v-for="item in navItems" :key="item.key" type="button" :class="{ active: item.key === 'profile' }" @click="navigate(item)">{{ item.label }}</button></nav></header>
    <section class="profile-layout" data-motion-group>
      <ProfileSidebar :active="activeModule" :authenticated="auth.isLoggedIn" :account="profile.account" :items="moduleItems" @select="selectModule" @login="login" />
      <section v-motion-content="activeModule" :key="auth.sessionGeneration" class="profile-content glass sr-glass sr-glass--reading" aria-live="polite">
        <LocalSpacePanel v-if="activeModule === 'local'" :summary="profile.local" :loading="profile.loading.has('local')" :error="profile.errors.local" @retry="profile.loadLocal" />
        <CloudAccountPanel v-else-if="activeModule === 'account'" :account="profile.account" :loading="profile.loading.has('account')" :error="profile.errors.account" @retry="reload('account')" @nickname="saveNickname" @avatar="saveAvatar" @logout="logout" />
        <ProfileStatsPanel v-else-if="activeModule === 'stats'" :stats="profile.stats" :report="profile.report" :loading="profile.loading.has('stats') || profile.loading.has('report')" :error="profile.errors.stats || profile.errors.report" @retry="reloadStats" />
        <ProfileCalendarPanel v-else-if="activeModule === 'calendar'" :days="profile.calendar" :loading="profile.loading.has('calendar')" :error="profile.errors.calendar" @retry="reload('calendar')" />
        <ProfilePostsPanel v-else-if="activeModule === 'posts'" :posts="profile.posts" :loading="profile.loading.has('posts')" :error="profile.errors.posts" @retry="reload('posts')" @remove="removePost" />
        <ProfileFeedbackPanel v-else-if="activeModule === 'feedback'" @submit="sendFeedback" />
        <ProfileSecurityPanel v-else-if="activeModule === 'security'" :required="auth.passwordChangeRequired" @change="changePassword" />
        <ProfileUpdatesPanel v-else-if="activeModule === 'client'" />
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {activityState} from '../activity/state';
import { useRoute, useRouter } from "vue-router";
import { scenes } from "../data/scenes";
import { fetchProfile, fetchProfileCalendar, fetchProfilePosts, fetchProfileStats, fetchShareCard } from "../services/profile";
import { useAuthStore } from "../stores/auth";
import { useProfileStore, type ProfileCloudModule } from "../stores/profile";
import { scaledNavModuleTop } from "../utils/layout";
import ProfileSidebar, { type ProfileModuleItem } from "./profile/ProfileSidebar.vue";
import LocalSpacePanel from "./profile/LocalSpacePanel.vue";
import CloudAccountPanel from "./profile/CloudAccountPanel.vue";
import ProfileStatsPanel from "./profile/ProfileStatsPanel.vue";
import ProfileCalendarPanel from "./profile/ProfileCalendarPanel.vue";
import ProfilePostsPanel from "./profile/ProfilePostsPanel.vue";
import ProfileFeedbackPanel from "./profile/ProfileFeedbackPanel.vue";
import ProfileSecurityPanel from "./profile/ProfileSecurityPanel.vue";
import ProfileUpdatesPanel from "./profile/ProfileUpdatesPanel.vue";

const router = useRouter(); const route = useRoute(); const auth = useAuthStore(); const profile = useProfileStore();
const scale = ref(1); const navScale = ref(1);
const localModule: ProfileModuleItem = { key: "local", label: "本机空间", description: "曲库、队列、专注与占用。" };
const cloudModules: ProfileModuleItem[] = [
  { key: "account", label: "云端账号", description: "资料、头像与账号状态。" }, { key: "stats", label: "学习统计", description: "真实同步记录与报告。" },
  { key: "calendar", label: "学习日历", description: "按日期查看专注记录。" }, { key: "posts", label: "我的动态", description: "管理已发布的动态。" },
  { key: "feedback", label: "反馈建议", description: "向管理员提交建议。" }, { key: "security", label: "账号安全", description: "修改密码与会话保护。" },
  { key: "client", label: "客户端版本", description: "私有更新通道状态。" }
];
const moduleItems = computed(() => auth.isLoggedIn ? [localModule, ...cloudModules] : [localModule]);
const requested = String(route.query.module || "");
const activeModule = ref(auth.passwordChangeRequired ? "security" : moduleItems.value.some((item) => item.key === requested) ? requested : auth.isLoggedIn ? "account" : "local");
const navItems = computed(() => {
  const items = [
    { key: "scene", label: "场景", name: "scene" }, { key: "focus", label: "专注", name: "focus" }, { key: "entertainment", label: "娱乐", name: "entertainment" },
    { key: "chat", label: "聊天", name: "chat" }, { key: "feed", label: "动态", name: "feed" }, { key: "profile", label: "我的", name: "profile" }
  ];
  if (auth.isAdmin) items.splice(5, 0, { key: "admin", label: "管理", name: "admin" });
  return items;
});
const backgroundStyle = computed(() => { const scene = scenes.find((item) => item.key === "mountain"); return { backgroundImage: `url(${scene?.images.forenoon || scene?.images.morning})` }; });
const frameStyle = computed(() => ({ "--profile-scale": scale.value, "--profile-layout-top": `${scaledNavModuleTop(navScale.value)}px` }));

function updateScale() { scale.value = Math.min(1, window.innerWidth / 1912, window.innerHeight / 969); navScale.value = Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080); }
function navigate(item: { key: string; name: string }) { if (item.key !== "profile") void router.push({ name: item.name }); }
function selectModule(key: string) { activeModule.value = key; void router.replace({ query: { ...route.query, module: key } }); }
function login() { void router.push({ name: "login", query: { redirect: "/profile" } }); }
async function logout() { await auth.logout(); profile.clearCloud(); selectModule("local"); }
async function saveNickname(value: string, done: (error?: string) => void) { try { await profile.saveNickname(value); done(); } catch (error) { done(error instanceof Error ? error.message : '昵称保存失败。'); } }
async function saveAvatar(file: File, done: (error?: string) => void) { try { await profile.saveAvatar(file); done(); } catch (error) { done(error instanceof Error ? error.message : '头像上传失败。'); } }
async function removePost(postId: string | number) { try { await profile.removePost(postId); } catch (error) { profile.errors.posts = error instanceof Error ? error.message : "动态删除失败。"; } }
async function sendFeedback(payload: { title: string; content: string; feedbackType: string }, done: (error?: string) => void) { try { await profile.sendFeedback(payload); done(); } catch (error) { done(error instanceof Error ? error.message : "反馈提交失败。"); } }
async function changePassword(payload: { oldPassword: string; newPassword: string }, done: (error?: string) => void) { try { await profile.changePassword(payload); done(); } catch (error) { done(error instanceof Error ? error.message : "密码修改失败。"); } }
function reload(key: ProfileCloudModule) {
  if (key === "account") return profile.loadModule(key, fetchProfile, (value) => { profile.account = value; });
  if (key === "stats") return profile.loadModule(key, fetchProfileStats, (value) => { profile.stats = value; });
  if (key === "calendar") return profile.loadModule(key, () => fetchProfileCalendar(), (value) => { profile.calendar = value; });
  if (key === "posts") return profile.loadModule(key, fetchProfilePosts, (value) => { profile.posts = value; });
  return profile.loadModule(key, fetchShareCard, (value) => { profile.report = value; });
}
async function reloadStats() { await Promise.all([reload("stats"), reload("report")]); }
let statsRefresh:ReturnType<typeof setTimeout>|undefined;
watch(() => [activityState.revision, activeModule.value], () => {
  if(activeModule.value!=='stats' || !auth.isLoggedIn || statsRefresh)return;
  statsRefresh=setTimeout(()=>{statsRefresh=undefined;if(activeModule.value==='stats' && auth.isLoggedIn)void reloadStats();},1000);
});
onBeforeUnmount(()=>clearTimeout(statsRefresh));
watch(() => [auth.user?.id, auth.sessionGeneration], async () => { profile.clearCloud(); if (auth.isLoggedIn) await profile.loadCloud(); else activeModule.value = 'local'; });
watch(() => auth.passwordChangeRequired, (required) => { if (required) selectModule("security"); });
onMounted(async () => { updateScale(); window.addEventListener("resize", updateScale, { passive: true }); await profile.initialize(auth.isLoggedIn); });
onBeforeUnmount(() => window.removeEventListener("resize", updateScale));
</script>

<style src="./profile/profile.css"></style>
