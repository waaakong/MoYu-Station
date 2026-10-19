import { app, ipcMain, Notification, type BrowserWindow, type IpcMainInvokeEvent, type Session } from "electron";
import { MessageNotificationService } from '../notifications';
import { join } from 'node:path';
import { PrivateSceneCache } from './sceneCache';
import { IPC_CHANNELS, parseSceneCacheRequest, type IpcChannel } from "@studyroom/contracts";
import { CloudClient } from "./client";
import { CloudStreams } from "./streams";
import { chatSendSchema, streamIdSchema, streamRequestSchema } from "./policy";
import { STUDYROOM_CLOUD_ORIGIN } from "../security/cloudOrigin";
import { IpcGuard } from "../ipc/guard";

export function trustedCloudDocument(actual: string, expected: string): boolean {
  try { const url = new URL(actual); url.hash = ""; return url.href === expected; } catch { return false; }
}

export function registerCloudBridge(window: BrowserWindow, cloudSession: Session, rendererUrl: string) {
  // BrowserWindow.webContents itself can throw after the window is destroyed.
  // Keep the original contents reference for late stream-close callbacks.
  const contents = window.webContents;
  const streams = new CloudStreams(cloudSession, event => {
    if (!window.isDestroyed() && !contents.isDestroyed()) contents.send(IPC_CHANNELS.cloudStreamEvent, event);
  });
  let sceneCache: PrivateSceneCache;
  const client = new CloudClient(STUDYROOM_CLOUD_ORIGIN,
    (url, init) => cloudSession.fetch(url, init),
    () => cloudSession.clearStorageData({ storages: ["cookies"] }),
    () => streams.closeAll(), owner => sceneCache?.setOwner(owner));
  sceneCache = new PrivateSceneCache(join(app.getPath('userData'), 'private-scene-cache'), client);
  const notifications = new MessageNotificationService({
    identity: () => ({ owner: client.authenticatedOwner, epoch: client.identityEpoch }),
    // On Windows a focused, restored window can briefly report isVisible() === false.
    // Native focus + not minimized is the authority; a hidden/tray window cannot hold focus.
    foreground: () => !window.isDestroyed() && !window.isMinimized() && window.isFocused(),
    supported: () => Notification.isSupported(),
    create: summary => new Notification({ title: '墨屿自习室', body: summary ? '你有未读私信，点击查看。' : '收到一条新私信，点击查看。', silent: true }),
    activate: value => {
      if (window.isDestroyed() || contents.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show(); window.focus();
      contents.send(IPC_CHANNELS.notificationClick, value);
    }
  });
  const stopIdentity = client.onIdentityChanged(() => notifications.clear());
  const guard = new IpcGuard(window.webContents.id, 60, 8);
  const channels: IpcChannel[] = [];
  function handle(channel: IpcChannel, operation: (value: unknown) => unknown) {
    channels.push(channel);
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
      try {
        const value = await guard.invoke(channel, event, () => {
          if (!trustedCloudDocument(event.senderFrame?.url || "", rendererUrl)) throw new Error("IPC_SENDER_REJECTED");
          return operation(input);
        });
        return { ok: true, value };
      } catch {
        // Do not serialize URLs, request bodies, network headers or credentials in errors.
        return { ok: false, error: { code: "CLOUD_REQUEST_FAILED", message: "云端请求失败或未获允许，请检查网络后重试。" } };
      }
    });
  }
  handle(IPC_CHANNELS.cloudRequest, input => client.request(input));
  handle(IPC_CHANNELS.notificationConfigure, input => notifications.configure(input));
  handle(IPC_CHANNELS.notificationShow, input => notifications.show(input));
  handle(IPC_CHANNELS.notificationDismiss, input => notifications.dismiss(input));
  handle(IPC_CHANNELS.sceneCache, async input => {
    const request=parseSceneCacheRequest(input);
    // Re-establish a server-verified identity after a pending cache cleanup; never trust Renderer ownership.
    if(request.action==='refresh')await client.request({method:'GET',path:'/auth/me'});
    return sceneCache.request(request);
  });
  handle(IPC_CHANNELS.cloudStreamOpen, input => { const request = streamRequestSchema.parse(input); streams.open(request.id, request.kind); });
  handle(IPC_CHANNELS.cloudStreamClose, input => streams.close(streamIdSchema.parse(input)));
  handle(IPC_CHANNELS.cloudChatSend, input => { const request = chatSendSchema.parse(input); streams.send(request.id, request.data); });
  const reset = () => { notifications.clear(); client.dispose(); };
  window.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) reset(); });
  window.webContents.on("render-process-gone", reset);
  window.once("closed", () => { reset(); stopIdentity(); for (const channel of channels) ipcMain.removeHandler(channel); });
  return client;
}
