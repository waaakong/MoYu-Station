import type { Session } from "electron";
import { STUDYROOM_CLOUD_ORIGIN, studyRoomWebSocketOrigin } from "./cloudOrigin";

export function configurePermissionSecurity(targetSession: Session): void {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  targetSession.setDevicePermissionHandler(() => false);
}

export function configureContentSecurityPolicy(targetSession: Session): void {
  const websocketOrigin = studyRoomWebSocketOrigin();
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: studyroom-media:",
    "font-src 'self' data:",
    "media-src 'self' blob: studyroom-media:",
    `connect-src 'self' ${STUDYROOM_CLOUD_ORIGIN} ${websocketOrigin}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; ");

  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [policy]
      }
    });
  });
}
