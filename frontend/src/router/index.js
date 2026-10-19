import { createRouter, createWebHashHistory, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useUpdatesStore } from "../stores/updates";

const WelcomePage = () => import("../pages/WelcomePage.vue");
const DownloadPage = () => import("../pages/DownloadPage.vue");
const SceneSelectPage = () => import("../pages/SceneSelectPage.vue");
const LoginPage = () => import("../pages/LoginPage.vue");
const RegisterPage = () => import("../pages/RegisterPage.vue");
const BannedPage = () => import("../pages/BannedPage.vue");
const ProfilePage = () => import("../pages/ProfilePage.vue");
const AdminPage = () => import("../pages/AdminPage.vue");
const FeedPage = () => import("../pages/FeedPage.vue");
const ChatPage = () => import("../pages/ChatPage.vue");
const FocusPage = () => import("../pages/FocusPage.vue");
const SoundPage = () => import("../pages/SoundPage.vue");
const EntertainmentPage = () => import("../pages/EntertainmentPage.vue");

const routes = [
  { path: "/", name: "welcome", component: WelcomePage, meta: { title: "墨屿自习室 · MoYu Station", shell: false } },
  { path: "/download", name: "download", component: DownloadPage, meta: { title: "下载客户端", shell: false, localAccess: true } },
  { path: "/scene", name: "scene", component: SceneSelectPage, meta: { title: "场景选择", localAccess: true } },
  { path: "/login", name: "login", component: LoginPage, meta: { title: "登录", shell: false } },
  { path: "/register", name: "register", component: RegisterPage, meta: { title: "注册", shell: false } },
  { path: "/banned", name: "banned", component: BannedPage, meta: { title: "账号封禁", shell: false } },
  { path: "/focus", name: "focus", component: FocusPage, meta: { title: "专注", localAccess: true } },
  { path: "/sound", name: "sound", component: SoundPage, meta: { title: "声音", localAccess: true } },
  { path: "/entertainment", name: "entertainment", component: EntertainmentPage, meta: { title: "娱乐", localAccess: true } },
  { path: "/chat", name: "chat", component: ChatPage, meta: { title: "聊天", requiresAuth: true } },
  { path: "/feed", name: "feed", component: FeedPage, meta: { title: "动态", requiresAuth: true } },
  { path: "/admin", name: "admin", component: AdminPage, meta: { title: "管理", requiresAuth: true, requiresAdmin: true } },
  { path: "/profile", name: "profile", component: ProfilePage, meta: { title: "我的", localAccess: true } }
];

const router = createRouter({
  history: typeof window !== "undefined" && window.studyRoomDesktop
    ? createWebHashHistory()
    : createWebHistory(),
  routes
});

let restoringSession = null;
function restoreSession(authStore) {
  if (!restoringSession) restoringSession = authStore.loadCurrentUser().finally(() => { restoringSession = null; });
  return restoringSession;
}

if (typeof window !== "undefined") {
  window.addEventListener("studyroom:logged-in-elsewhere", () => {
    const authStore = useAuthStore();
    authStore.clearLocalSession();
    if (!router.currentRoute.value.meta.localAccess && router.currentRoute.value.name !== "login") {
      router.push({
        name: "login",
        query: {
          redirect: router.currentRoute.value.fullPath,
          reason: "logged-in-elsewhere"
        }
      });
    }
  });
  window.addEventListener("studyroom:session-ended", () => {
    const authStore = useAuthStore();
    authStore.clearLocalSession();
    if (!router.currentRoute.value.meta.localAccess && !["login", "register"].includes(String(router.currentRoute.value.name))) {
      router.push({ name: "login", query: { redirect: router.currentRoute.value.fullPath, reason: "session-ended" } });
    }
  });
  window.addEventListener("studyroom:account-banned", () => {
    const authStore = useAuthStore();
    authStore.markBanned();
    if (!router.currentRoute.value.meta.localAccess && router.currentRoute.value.name !== "banned") {
      router.push({ name: "banned" });
    }
  });
}

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  const updatesStore = useUpdatesStore();
  const authSkipRoutes = ["login", "register", "banned"];

  if (!authStore.loaded && !authSkipRoutes.includes(to.name)) {
    if (to.meta.requiresAuth) await restoreSession(authStore);
    else void restoreSession(authStore);
  }

  if (authStore.isBanned && !to.meta.localAccess && !["banned", "login"].includes(String(to.name))) {
    return { name: "banned" };
  }

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    sessionStorage.setItem("studyroom-post-login-target", to.fullPath);
    return {
      name: "login",
      query: { redirect: to.fullPath }
    };
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return { name: "scene" };
  }

  if (authStore.passwordChangeRequired && !to.meta.localAccess && !["profile", "login"].includes(String(to.name))) {
    return { name: "profile", query: { module: "security", reason: "password-change-required" } };
  }

  if (updatesStore.status.state === "required" && !updatesStore.status.errorCode && !to.meta.localAccess && !["profile", "login"].includes(String(to.name))) {
    return { name: "profile", query: { module: "client", reason: "required-update" } };
  }

  return true;
});

router.afterEach((to) => {
  const title = to.meta.title || "";
  document.title = to.name === "welcome" || !title ? "墨屿自习室 · MoYu Station" : `${title} · 墨屿自习室`;
});

export default router;
