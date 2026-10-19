import { defineStore } from "pinia";
import { clearReliableCreates } from '../services/reliableCreate';
import { useAdminStore } from './admin';
import { clearChatMemory } from '../chat/chatMemory';
import { clearSessionMediaDrafts } from '../media/sessionDrafts';
import { clearStickerSession } from '../stickers/session';
import { clearFeedSession } from '../feed/session';
import { clearPrivateScene } from '../scenes/privateSession';
import {closeSharedChatChannel} from '../chat/sharedChannel';
import { invalidateCsrfToken } from "../services/http";
import { isUnknownWriteOutcome } from '../services/writeOutcome';
import { useProfileStore } from './profile';
import {
  fetchCurrentUser,
  loginAccount,
  logoutAccount,
  registerAccount,
  type LoginPayload,
  type RegisterPayload,
  type UserProfile
} from "../services/auth";

type AccountRestriction = "banned" | null;

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as UserProfile | null,
    loaded: false,
    sessionGeneration: 0,
    authOperation: 0,
    authTransition: false,
    sessionCheckError: '',
    restriction: null as AccountRestriction
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.user),
    userRole: (state) => String(state.user?.userType || "").toUpperCase(),
    userStatus: (state) => String(state.user?.onlineStatus || "").toUpperCase(),
    isAdmin(): boolean {
      return this.userRole === "ADMIN" || this.userRole === "管理员";
    },
    isBanned(): boolean {
      return this.restriction === "banned"
        || this.userRole === "BANNED"
        || this.userRole === "封禁用户"
        || this.userStatus === "BANNED";
    },
    passwordChangeRequired: (state) => Boolean(state.user?.passwordChangeRequired)
  },
  actions: {
    async loadCurrentUser() {
      if (this.authTransition) return;
      const operation = ++this.authOperation;
      try {
        const user = await fetchCurrentUser();
        if (operation !== this.authOperation) return;
        if (user?.id !== this.user?.id) { useAdminStore().$reset(); clearReliableCreates(); useProfileStore().clearCloud(); this.sessionGeneration++; closeSharedChatChannel(); clearPrivateScene(); clearChatMemory(); clearSessionMediaDrafts(); clearStickerSession(); clearFeedSession(); }
        this.user = user;
        this.sessionCheckError = '';
        this.restriction = this.user?.userType?.toUpperCase() === "BANNED" ? "banned" : null;
      } catch (error: any) {
        if (operation !== this.authOperation) return;
        const code = error?.code || error?.response?.data?.code;
        if (code === 'AUTH_ACCOUNT_BANNED') this.markBanned();
        else if (Number(error?.status || error?.response?.status) === 401 || ['AUTH_REQUIRED', 'AUTH_SESSION_EXPIRED', 'ACCOUNT_LOGGED_IN_ELSEWHERE'].includes(code)) this.clearLocalSession();
        else this.sessionCheckError = '暂时无法确认登录状态，请联网后重试。';
      } finally {
        if (operation === this.authOperation) this.loaded = true;
      }
    },
    async login(payload: LoginPayload) {
      if (this.authTransition) throw new Error("登录状态正在变更，请稍后重试。");
      this.clearLocalSession();
      const operation = this.authOperation;
      this.authTransition = true;
      try {
        let user;
        try { user = await loginAccount(payload); }
        catch (error) {
          if (!isUnknownWriteOutcome(error) || operation !== this.authOperation) throw error;
          // A lost login response is not evidence of failure. Only adopt the expected account.
          let current;
          try { current = await fetchCurrentUser(); } catch { throw error; }
          if (!current || current.username !== payload.username) throw error;
          user = current;
          invalidateCsrfToken();
        }
        if (operation !== this.authOperation) throw new Error("本次登录已失效，请重新登录。");
        this.user = user;
        this.restriction = user?.userType?.toUpperCase() === "BANNED" ? "banned" : null;
        return user;
      } finally { this.authTransition = false; }
    },
    async register(payload: RegisterPayload) {
      return registerAccount(payload);
    },
    async logout() {
      if (this.authTransition) throw new Error("登录状态正在变更，请稍后重试。");
      this.clearLocalSession();
      this.authTransition = true;
      try {
        await logoutAccount();
      } finally {
        this.authTransition = false;
      }
    },
    markBanned() {
      useAdminStore().$reset();
      clearReliableCreates();
      useProfileStore().clearCloud();
      closeSharedChatChannel();
      clearPrivateScene();
      clearFeedSession();
      clearStickerSession();
      clearSessionMediaDrafts();
      clearChatMemory();
      this.sessionGeneration++;
      this.authOperation++;
      invalidateCsrfToken();
      this.restriction = "banned";
      this.loaded = true;
    },
    clearLocalSession() {
      useAdminStore().$reset();
      clearReliableCreates();
      useProfileStore().clearCloud();
      closeSharedChatChannel();
      clearPrivateScene();
      clearFeedSession();
      clearStickerSession();
      clearSessionMediaDrafts();
      clearChatMemory();
      this.sessionGeneration++;
      this.authOperation++;
      invalidateCsrfToken();
      this.user = null;
      this.sessionCheckError = '';
      this.loaded = true;
      this.restriction = null;
    }
  }
});
