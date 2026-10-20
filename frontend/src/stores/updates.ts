import type { UpdateStatus } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { hasVolatileWork, prepareLocalQuit, recoverLocalQuit } from '../window/quitPreparation';
import type { UpdatePreparationRequest } from '@studyroom/contracts';

const WEB_STATUS: UpdateStatus = {
  state: "disabled",
  currentVersion: "web",
  channel: "stable",
  message: "客户端更新仅在 Windows 桌面版中可用。",
  canRetry: false
};

let removeStatusListener: (() => void) | undefined;
let removePreparationListener: (() => void) | undefined;
let previousInert: boolean | undefined;
function thaw() {
  if (previousInert !== undefined) {
    const root = document.getElementById('app');
    if (root) root.inert = previousInert;
    previousInert = undefined;
    recoverLocalQuit();
  }
}

export const useUpdatesStore = defineStore("updates", {
  state: () => ({ status: { ...WEB_STATUS }, initialized: false, actionError: '', installing: false, preparing: false }),
  getters: {
    isDesktop: () => Boolean(window.studyRoomDesktop),
    progressLabel: (state) => `${Math.round(state.status.progressPercent || 0)}%`
  },
  actions: {
    acceptStatus(status: UpdateStatus) {
      if (this.status.revision !== undefined && (status.revision === undefined || status.revision < this.status.revision)) return;
      this.status = status;
      if (!status.updateIntent && status.state !== 'installing') { this.preparing = false; thaw(); }
    },
    async initialize(authenticated: boolean, accountSession?: string) {
      if (!window.studyRoomDesktop) {
        this.status = { ...WEB_STATUS };
        this.initialized = true;
        return;
      }
      if (!removeStatusListener) {
        removeStatusListener = window.studyRoomDesktop.onUpdateStatus(({ status }) => {
          this.acceptStatus(status);
        });
      }
      if (!removePreparationListener && window.studyRoomDesktop.onUpdatePreparation) {
        removePreparationListener = window.studyRoomDesktop.onUpdatePreparation(request => { void this.prepare(request); });
      }
      this.acceptStatus(await window.studyRoomDesktop.setUpdaterAuthState({ authenticated, accountSession }));
      this.initialized = true;
    },
    async setAuthenticated(authenticated: boolean, accountSession?: string) {
      if (!window.studyRoomDesktop) return;
      this.acceptStatus(await window.studyRoomDesktop.setUpdaterAuthState({ authenticated, accountSession }));
    },
    async setActivity(focusActive: boolean, audioActive: boolean, draftsActive = hasVolatileWork()) {
      if (!window.studyRoomDesktop) return;
      this.acceptStatus(await window.studyRoomDesktop.setUpdaterActivityState({ focusActive, audioActive, draftsActive }));
    },
    async start() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.startUpdate()); }
      catch { this.actionError = '更新未开始：授权或本机保存流程尚未就绪，请重新检查更新。'; }
    },
    async prepare(request: UpdatePreparationRequest) {
      const bridge = window.studyRoomDesktop;
      if (!bridge || this.preparing) return;
      this.preparing = true;
      const root = document.getElementById('app');
      previousInert = root?.inert ?? false;
      if (root) root.inert = true;
      try {
        if (hasVolatileWork()) throw new Error('UNSAVED_WORK');
        await prepareLocalQuit();
        if (hasVolatileWork()) throw new Error('UNSAVED_WORK');
        const rendererState: Record<string, string> = {};
        for (let index = 0; index < localStorage.length; index++) {
          const key = localStorage.key(index);
          if (key && /^studyroom[-:](?:focus|sound|player|scene|shell|memo|todo|entertainment|game|web-queue)[A-Za-z0-9:._-]*$/.test(key)) {
            const value = localStorage.getItem(key);
            if (value !== null) rendererState[key] = value;
          }
        }
        await bridge.completeUpdatePreparation({ id: request.id, ready: true, rendererState });
      } catch {
        try { await bridge.completeUpdatePreparation({ id: request.id, ready: false }); } catch { /* A cancelled request must not be acknowledged again. */ }
        this.preparing = false; thaw();
        this.actionError = '安装未开始：本机保存或备份未通过，当前版本仍可继续使用。';
      }
    },
    async check() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.checkForUpdates()); }
      catch { this.actionError = '无法连接客户端更新服务，请稍后重试。'; }
    },
    async download() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.downloadUpdate()); }
      catch { this.actionError = '下载未完成，请重新检查更新后重试。'; }
    },
    async cancelDownload() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.cancelUpdateDownload()); }
      catch { this.actionError = '取消请求未确认，请检查更新状态后重试。'; }
    },
    async setAutomaticChecks(enabled: boolean) {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.setAutomaticUpdateChecks(enabled)); }
      catch { this.actionError = '更新偏好未保存，请稍后重试。'; }
    },
    async defer() {
      this.actionError = '';
      try { if (window.studyRoomDesktop) this.acceptStatus(await window.studyRoomDesktop.deferUpdate()); }
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
      removePreparationListener?.(); removePreparationListener = undefined;
      this.preparing = false; thaw();
      this.initialized = false;
    }
  }
});
