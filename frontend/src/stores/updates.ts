import type { UpdateStatus } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { hasVolatileWork, prepareLocalQuit } from '../window/quitPreparation';

const WEB_STATUS: UpdateStatus = {
  state: "disabled",
  currentVersion: "web",
  channel: "stable",
  message: "客户端更新仅在 Windows 桌面版中可用。",
  canRetry: false
};

let removeStatusListener: (() => void) | undefined;

export const useUpdatesStore = defineStore("updates", {
  state: () => ({ status: { ...WEB_STATUS }, initialized: false, actionError: '', installing: false }),
  getters: {
    isDesktop: () => Boolean(window.studyRoomDesktop),
    progressLabel: (state) => `${Math.round(state.status.progressPercent || 0)}%`
  },
  actions: {
    async initialize(authenticated: boolean) {
      if (!window.studyRoomDesktop) {
        this.status = { ...WEB_STATUS };
        this.initialized = true;
        return;
      }
      if (!removeStatusListener) {
        removeStatusListener = window.studyRoomDesktop.onUpdateStatus(({ status }) => { this.status = status; });
      }
      this.status = await window.studyRoomDesktop.setUpdaterAuthState({ authenticated });
      this.initialized = true;
    },
    async setAuthenticated(authenticated: boolean) {
      if (!window.studyRoomDesktop) return;
      this.status = await window.studyRoomDesktop.setUpdaterAuthState({ authenticated });
    },
    async setActivity(focusActive: boolean, audioActive: boolean) {
      if (!window.studyRoomDesktop) return;
      this.status = await window.studyRoomDesktop.setUpdaterActivityState({ focusActive, audioActive });
    },
    async check() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.status = await window.studyRoomDesktop.checkForUpdates(); }
      catch { this.actionError = '无法连接客户端更新服务，请稍后重试。'; }
    },
    async download() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.status = await window.studyRoomDesktop.downloadUpdate(); }
      catch { this.actionError = '下载未完成，请重新检查更新后重试。'; }
    },
    async cancelDownload() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.status = await window.studyRoomDesktop.cancelUpdateDownload(); }
      catch { this.actionError = '取消请求未确认，请检查更新状态后重试。'; }
    },
    async setAutomaticChecks(enabled: boolean) {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.status = await window.studyRoomDesktop.setAutomaticUpdateChecks(enabled); }
      catch { this.actionError = '更新偏好未保存，请稍后重试。'; }
    },
    async defer() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.status = await window.studyRoomDesktop.deferUpdate(); }
      catch { this.actionError = '暂时无法延后此更新，请重新检查状态。'; }
    },
    async install() {
      if (!window.studyRoomDesktop || this.installing) return;
      this.actionError = '';
      if (hasVolatileWork()) { this.actionError = '还有未提交的草稿或上传，请先保存或处理后再安装。'; return; }
      if (!this.status.canInstall) { this.actionError = '请等待下载校验、专注和播放结束后再安装。'; return; }
      this.installing = true;
      try {
        await prepareLocalQuit();
        // Drafts can change while local persistence is being flushed.
        if (hasVolatileWork()) throw new Error('UNSAVED_WORK');
        await window.studyRoomDesktop.installUpdate();
      } catch {
        this.actionError = '安装未开始：本机保存或更新授权复核未通过。请处理未保存内容并重新检查更新。';
      } finally { this.installing = false; }
    },
    dispose() {
      removeStatusListener?.();
      removeStatusListener = undefined;
      this.initialized = false;
    }
  }
});
