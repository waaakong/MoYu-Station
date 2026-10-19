<template>
  <main class="admin-page" :style="frameStyle">
    <div class="admin-background" :style="backgroundStyle"></div><div class="admin-shade"></div>
    <header class="admin-topbar"><nav aria-label="主导航"><button v-for="item in navItems" :key="item.key" type="button" :class="{ active:item.key==='admin' }" @click="navigate(item)">{{ item.label }}</button></nav></header>
    <section class="admin-layout" data-motion-group>
      <AdminSidebar :active="activeModule" :admin-name="adminName" :items="modules" @select="selectModule" />
      <section v-motion-content="activeModule" class="admin-content admin-glass sr-glass sr-glass--reading" aria-live="polite">
        <p v-if="admin.errors.action" class="admin-action-error" role="alert">{{ admin.errors.action }}</p>
        <p v-if="admin.recordMessage" role="status">{{ admin.recordMessage }}</p>
        <AdminOverviewPanel v-if="activeModule==='overview'" :dashboard="admin.dashboard" :loading="loading('overview')" :error="admin.errors.overview" @retry="load('overview')" />
        <AdminUsersPanel v-else-if="activeModule==='users'" :users="admin.users" :loading="loading('users')" :error="admin.errors.users" @retry="load('users')" @role="admin.changeUserType" @password="admin.resetPassword" />
        <AdminInvitationsPanel v-else-if="activeModule==='invitations'" :invitations="admin.invitations" :loading="loading('invitations')" :error="admin.errors.invitations" @retry="load('invitations')" @create="admin.addInvitation" @disable="admin.revokeInvitation" />
        <AdminPostsPanel v-else-if="activeModule==='posts'" :posts="admin.posts" :loading="loading('posts')" :error="admin.errors.posts" @retry="load('posts')" @remove="admin.removePost" />
        <AdminFeedbackPanel v-else-if="activeModule==='feedback'" :feedback="admin.feedback" :loading="loading('feedback')" :error="admin.errors.feedback" @retry="load('feedback')" @status="admin.changeFeedback" @remove="admin.removeFeedback" />
        <AdminReleasesPanel v-else-if="activeModule==='releases'" :releases="admin.releases" :members="admin.members" :users="admin.users" :loading="loading('releases')" :error="admin.errors.releases" @retry="load('releases')" @membership="admin.changeMembership" @policy="admin.changeRelease" />
        <AdminAuditsPanel v-else-if="activeModule==='audits'" :page="admin.audits" :loading="loading('audits')" :error="admin.errors.audits" @retry="load('audits')" @page="changeAuditPage" />
        <AdminSettingsPanel v-else />
        <footer v-if="recordModule && admin.pageCursors[recordModule]" class="admin-pagination">
          <button type="button" :disabled="admin.pageBusy.has(recordModule)||loading(recordModule)" @click="admin.loadMoreRecords(recordModule)">{{ admin.pageBusy.has(recordModule)?'加载中…':'加载更多记录' }}</button>
        </footer>
      </section>
    </section>
    <AdminReverifyDialog v-if="admin.reverifyOpen" :action="admin.pendingAction?.label||'高风险操作'" :busy="admin.reverifyBusy" :error="admin.reverifyError" @cancel="admin.cancelReverification" @confirm="admin.confirmReverification" />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { scenes } from "../data/scenes";
import { adminDashboardStreamUrl, type AdminDashboard } from "../services/admin";
import { DesktopCloudStream } from "../services/desktopCloud";
import { useAdminStore, type AdminModule } from "../stores/admin";
import { useAuthStore } from "../stores/auth";
import { scaledNavModuleTop } from "../utils/layout";
import AdminAuditsPanel from "./admin/AdminAuditsPanel.vue";
import AdminFeedbackPanel from "./admin/AdminFeedbackPanel.vue";
import AdminInvitationsPanel from "./admin/AdminInvitationsPanel.vue";
import AdminOverviewPanel from "./admin/AdminOverviewPanel.vue";
import AdminPostsPanel from "./admin/AdminPostsPanel.vue";
import AdminReleasesPanel from "./admin/AdminReleasesPanel.vue";
import AdminReverifyDialog from "./admin/AdminReverifyDialog.vue";
import AdminSettingsPanel from "./admin/AdminSettingsPanel.vue";
import AdminSidebar, { type AdminNavItem } from "./admin/AdminSidebar.vue";
import AdminUsersPanel from "./admin/AdminUsersPanel.vue";

const router = useRouter(); const auth = useAuthStore(); const admin = useAdminStore();
const activeModule = ref<AdminModule>("overview"); const navScale = ref(1); let stream: EventSource | DesktopCloudStream | null = null;
const recordModule=computed(()=>['users','posts','feedback'].includes(activeModule.value)?activeModule.value as 'users'|'posts'|'feedback':null);
let streamRetry = 0; let streamAttempts = 0; let disposed = false;
const modules: AdminNavItem[] = [
  { key: "overview", label: "概览", description: "有界运行快照。" }, { key: "users", label: "用户", description: "角色、封禁与改密。" },
  { key: "invitations", label: "邀请码", description: "创建、查看与停用。" }, { key: "posts", label: "动态", description: "内容治理与强删。" },
  { key: "feedback", label: "反馈", description: "处理用户反馈。" }, { key: "releases", label: "客户端发布", description: "白名单与灰度策略。" },
  { key: "audits", label: "审计", description: "分页脱敏操作记录。" }, { key: "settings", label: "设置", description: "安全与生产边界。" }
];
const navItems = computed(() => [
  { key: "scene", label: "场景", name: "scene" }, { key: "focus", label: "专注", name: "focus" }, { key: "entertainment", label: "娱乐", name: "entertainment" },
  { key: "chat", label: "聊天", name: "chat" }, { key: "feed", label: "动态", name: "feed" }, { key: "admin", label: "管理", name: "admin" }, { key: "profile", label: "我的", name: "profile" }
]);
const adminName = computed(() => auth.user?.nickname || auth.user?.username || "管理员");
const backgroundStyle = computed(() => { const scene = scenes.find((item) => item.key === "library") || scenes[0]; return { backgroundImage: `url(${scene?.images?.night || scene?.images?.forenoon})` }; });
const frameStyle = computed(() => ({ "--admin-layout-top": `${scaledNavModuleTop(navScale.value)}px` }));
const loading = (key: AdminModule) => admin.loading.has(key); const load = (key: AdminModule) => admin.load(key);
function updateScale() { navScale.value = Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080); }
function navigate(item: { key: string; name: string }) { if (item.key !== "admin") void router.push({ name: item.name }); }
function selectModule(key: AdminModule) { activeModule.value = key; if (key !== "settings") void admin.load(key); }
function changeAuditPage(page: number) { admin.audits.page = page; void admin.load("audits"); }
function startStream() {
  if (disposed || (!window.EventSource && !window.studyRoomDesktop?.cloud)) return;
  stream = window.studyRoomDesktop?.cloud ? new DesktopCloudStream("dashboard") : new EventSource(adminDashboardStreamUrl(), { withCredentials: true });
  stream.addEventListener("dashboard", (event) => { try { admin.acceptDashboard(JSON.parse((event as MessageEvent).data) as AdminDashboard); streamAttempts = 0; } catch { /* wait for the next valid frame */ } });
  stream.onerror = () => {
    stream?.close(); stream = null;
    admin.errors.overview = "实时监控连接中断，当前数据可能已过期，正在重连。";
    window.clearTimeout(streamRetry);
    if (!disposed) streamRetry = window.setTimeout(startStream, Math.min(30000, 1000 * 2 ** Math.min(streamAttempts++, 5)));
  };
}
onMounted(async () => { updateScale(); window.addEventListener("resize", updateScale, { passive: true }); await admin.loadInitial(); if (!disposed) startStream(); });
onBeforeUnmount(() => { disposed = true; window.clearTimeout(streamRetry); window.removeEventListener("resize", updateScale); stream?.close(); admin.cancelReverification(); });
</script>

<style src="./admin/admin.css"></style>
