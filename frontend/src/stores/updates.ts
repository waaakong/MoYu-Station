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
type UpdateFailureNotice = Pick<UpdateStatus, 'message' | 'errorCode' | 'canRetry'>;
function thaw() {
  if (previousInert !== undefined) {
    const root = document.getElementById('app');
    if (root) root.inert = previousInert;
    previousInert = undefined;
    recoverLocalQuit();
  }
}

export const useUpdatesStore = defineStore("updates", {
  state: () => ({ status: { ...WEB_STATUS }, initialized: false, actionError: '', installing: false, preparing: false,
    failureNotice: undefined as UpdateFailureNotice | undefined, updateOperationActive: false, noticeAccountSession: undefined as string | undefined, noticeGeneration: 0 }),
  getters: {
    isDesktop: () => Boolean(window.studyRoomDesktop),
    progressLabel: (state) => `${Math.round(state.status.progressPercent || 0)}%`
  },
  actions: {
    acceptStatus(status: UpdateStatus) {
      if (this.status.revision !== undefined && (status.revision === undefined || status.revision < this.status.revision)) return;
      if (this.updateOperationActive && status.state === 'error') {
        this.failureNotice = { message: status.message || '更新未完成，当前版本仍可继续使用。', errorCode: status.errorCode, canRetry: status.canRetry };
        this.updateOperationActive = false;
      }
      this.status = status;
      if (status.updateIntent) this.updateOperationActive = true;
      if (!status.updateIntent && status.state !== 'installing') { this.preparing = false; thaw(); }
    },
    dismissFailureNotice() { this.failureNotice = undefined; this.updateOperationActive = false; this.noticeGeneration++; },
    synchronizeNoticeIdentity(authenticated: boolean, accountSession?: string) {
      if (!authenticated || accountSession !== this.noticeAccountSession) {
        this.failureNotice = undefined; this.updateOperationActive = false; this.actionError = '';
        this.noticeGeneration++;
      }
      this.noticeAccountSession = authenticated ? accountSession : undefined;
    },
    async runUpdateAction(action: () => Promise<UpdateStatus>, fallback: string) {
      const generation = ++this.noticeGeneration;
      this.actionError = ''; this.failureNotice = undefined; this.updateOperationActive = true;
      try { const status = await action(); if (generation === this.noticeGeneration) this.acceptStatus(status); }
      catch { if (generation === this.noticeGeneration) { this.actionError = fallback; this.failureNotice = { message: fallback, canRetry: true }; } }
      finally { if (generation === this.noticeGeneration && !this.status.updateIntent) this.updateOperationActive = false; }
    },
    async initialize(authenticated: boolean, accountSession?: string) {
      this.synchronizeNoticeIdentity(authenticated, accountSession);
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
      this.synchronizeNoticeIdentity(authenticated, accountSession);
      if (!window.studyRoomDesktop) return;
      this.acceptStatus(await window.studyRoomDesktop.setUpdaterAuthState({ authenticated, accountSession }));
    },
    async setActivity(focusActive: boolean, audioActive: boolean, draftsActive = hasVolatileWork()) {
      if (!window.studyRoomDesktop) return;
      this.acceptStatus(await window.studyRoomDesktop.setUpdaterActivityState({ focusActive, audioActive, draftsActive }));
    },
    async start() {
      if (window.studyRoomDesktop) await this.runUpdateAction(() => window.studyRoomDesktop!.startUpdate(), '更新未开始：授权或本机保存流程尚未就绪，请重新检查更新。');
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
      if (window.studyRoomDesktop) await this.runUpdateAction(() => window.studyRoomDesktop!.checkForUpdates(), '无法连接客户端更新服务，请稍后重试。');
    },
    async download() {
      if (window.studyRoomDesktop) await this.runUpdateAction(() => window.studyRoomDesktop!.downloadUpdate(), '下载未完成，请重新检查更新后重试。');
    },
    async cancelDownload() {
      this.actionError = ''; this.updateOperationActive = false; this.noticeGeneration++;
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
      const generation = ++this.noticeGeneration;
      this.failureNotice = undefined; this.updateOperationActive = true;
      this.installing = true;
      try {
        await prepareLocalQuit();
        // Drafts can change while local persistence is being flushed.
        if (hasVolatileWork()) throw new Error('UNSAVED_WORK');
        await window.studyRoomDesktop.installUpdate();
      } catch {
        if (generation === this.noticeGeneration) {
          this.actionError = '安装未开始：本机保存或更新授权复核未通过。请处理未保存内容并重新检查更新。';
          this.failureNotice ??= { message: this.actionError, canRetry: true };
        }
      } finally { this.installing = false; if (generation === this.noticeGeneration && !this.status.updateIntent) this.updateOperationActive = false; }
    },
    dispose() {
      this.failureNotice = undefined; this.updateOperationActive = false; this.noticeAccountSession = undefined; this.noticeGeneration++;
      removeStatusListener?.();
      removeStatusListener = undefined;
      removePreparationListener?.(); removePreparationListener = undefined;
      this.preparing = false; thaw();
      this.initialized = false;
    }
  }
});
