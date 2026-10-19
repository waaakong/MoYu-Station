import type { LocalProfileSummary } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { readLocalProfileSummary } from "../services/localProfile";
import {
  deleteOwnPost,
  fetchProfile,
  fetchProfileCalendar,
  fetchProfilePosts,
  fetchProfileStats,
  fetchShareCard,
  submitFeedback,
  updateNickname,
  updateOwnPassword,
  uploadAvatar,
  type FeedbackPayload,
  type ProfileCalendarDay,
  type ProfileDetails,
  type ProfilePost,
  type ProfileStats,
  type ShareCard
} from "../services/profile";
import { useAuthStore } from "./auth";
import { isUnknownWriteOutcome } from '../services/writeOutcome';

export type ProfileCloudModule = "account" | "stats" | "calendar" | "posts" | "report";
type ModuleErrors = Partial<Record<ProfileCloudModule | "local", string>>;

function message(error: unknown): string {
  return error instanceof Error ? error.message : "数据暂时无法加载，请稍后重试。";
}

export const useProfileStore = defineStore("profile", {
  state: () => ({
    local: null as LocalProfileSummary | null,
    account: null as ProfileDetails | null,
    stats: null as ProfileStats | null,
    calendar: [] as ProfileCalendarDay[],
    posts: [] as ProfilePost[],
    report: null as ShareCard | null,
    errors: {} as ModuleErrors,
    loading: new Set<string>(),
    cloudGeneration: 0,
    moduleRequests: {} as Partial<Record<ProfileCloudModule, number>>,
    accountWrite: 0,
    accountSaving: false
  }),
  actions: {
    async initialize(authenticated: boolean) {
      await this.loadLocal();
      if (authenticated) await this.loadCloud();
      else this.clearCloud();
    },
    async loadLocal() {
      this.loading.add("local");
      delete this.errors.local;
      try { this.local = await readLocalProfileSummary(); }
      catch (error) { this.errors.local = message(error); }
      finally { this.loading.delete("local"); }
    },
    async loadCloud() {
      await Promise.all([
        this.loadModule("account", fetchProfile, (value) => { this.account = value; }),
        this.loadModule("stats", fetchProfileStats, (value) => { this.stats = value; }),
        this.loadModule("calendar", () => fetchProfileCalendar(), (value) => { this.calendar = value; }),
        this.loadModule("posts", fetchProfilePosts, (value) => { this.posts = value; }),
        this.loadModule("report", fetchShareCard, (value) => { this.report = value; })
      ]);
    },
    async loadModule<T>(key: ProfileCloudModule, request: () => Promise<T>, apply: (value: T) => void) {
      const auth = useAuthStore();
      if (!auth.isLoggedIn || auth.isBanned || auth.authTransition) return;
      const userId = auth.user?.id, session = auth.sessionGeneration, cloud = this.cloudGeneration;
      const version = (this.moduleRequests[key] || 0) + 1;
      this.moduleRequests[key] = version;
      const current = () => session === auth.sessionGeneration && userId === auth.user?.id
        && cloud === this.cloudGeneration && version === this.moduleRequests[key];
      this.loading.add(key);
      delete this.errors[key];
      try { const value = await request(); if (current()) apply(value); }
      catch (error) { if (current()) this.errors[key] = message(error); }
      finally { if (current()) this.loading.delete(key); }
    },
    clearCloud() {
      this.cloudGeneration++;
      this.accountWrite++;
      this.accountSaving = false;
      this.account = null;
      this.stats = null;
      this.calendar = [];
      this.posts = [];
      this.report = null;
      this.errors = this.errors.local ? { local: this.errors.local } : {};
      for (const key of [...this.loading]) if (key !== "local") this.loading.delete(key);
    },
    applyAccount(account: ProfileDetails) {
      this.account = account;
      const auth = useAuthStore();
      auth.user = { ...(auth.user || account), ...account };
    },
    async saveAccount(request: () => Promise<ProfileDetails>) {
      const auth = useAuthStore(), session = auth.sessionGeneration, userId = auth.user?.id;
      if (!userId || auth.authTransition || auth.isBanned) throw new Error('请重新登录后修改资料。');
      if (this.accountSaving) throw new Error('资料正在保存，请稍后重试。');
      const version = ++this.accountWrite;
      this.accountSaving = true;
      this.moduleRequests.account = (this.moduleRequests.account || 0) + 1;
      this.loading.delete('account');
      const current = () => session === auth.sessionGeneration && userId === auth.user?.id && version === this.accountWrite;
      try {
        const account = await request();
        if (!current() || account.id !== userId) throw new Error('账号已变化，本次结果已忽略。');
        this.moduleRequests.account = (this.moduleRequests.account || 0) + 1;
        this.loading.delete('account');
        this.applyAccount(account);
      } finally { if (current()) this.accountSaving = false; }
    },
    async saveNickname(nickname: string) {
      await this.saveAccount(async () => {
        try { return await updateNickname(nickname); }
        catch (error) {
          if (!isUnknownWriteOutcome(error)) throw error;
          try { const account = await fetchProfile(); if (account.nickname === nickname) return account; } catch { /* Keep the original task unconfirmed. */ }
          throw new Error('昵称保存结果尚未确认，请重新加载资料核对后再操作。');
        }
      });
    },
    async saveAvatar(file: File) {
      await this.saveAccount(async () => {
        try { return await uploadAvatar(file); }
        catch (error) { if (isUnknownWriteOutcome(error)) throw new Error('头像保存结果尚未确认，请重新加载资料核对后再操作。'); throw error; }
      });
    },
    async changePassword(payload: { oldPassword: string; newPassword: string }) {
      const auth = useAuthStore(), session = auth.sessionGeneration, userId = auth.user?.id;
      if (!userId || auth.authTransition) throw new Error('请重新登录后修改密码。');
      try { await updateOwnPassword(payload); }
      catch (error) {
        if (isUnknownWriteOutcome(error)) throw new Error('密码修改结果尚未确认，请重新登录核对，勿重复提交。');
        throw error;
      }
      if (session !== auth.sessionGeneration || userId !== auth.user?.id) throw new Error('密码已修改，但当前账号已变化；请使用新密码登录。');
      // A successful write stays successful even if a subsequent profile refresh fails.
      if (auth.user) auth.user.passwordChangeRequired = false;
      await this.loadModule("account", fetchProfile, (value) => { this.account = value; });
    },
    async removePost(postId: string | number) {
      const auth = useAuthStore(), session = auth.sessionGeneration, userId = auth.user?.id;
      await deleteOwnPost(postId);
      if (session !== auth.sessionGeneration || userId !== auth.user?.id) return;
      this.posts = this.posts.filter((post) => post.id !== postId);
    },
    async sendFeedback(payload: FeedbackPayload) { return submitFeedback(payload); }
  }
});
