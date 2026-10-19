import type { Session } from "electron";
import { STUDYROOM_CLOUD_ORIGIN, STUDYROOM_DESKTOP_ORIGIN } from "./cloudOrigin";

export const STUDYROOM_API_ORIGIN = STUDYROOM_CLOUD_ORIGIN;
export const DESKTOP_ORIGIN = STUDYROOM_DESKTOP_ORIGIN;
export const DESKTOP_CHANNEL_HEADER = "X-StudyRoom-Client";
export const DESKTOP_CHANNEL_VALUE = "desktop-v1";

type RequestHeaders = Record<string, string>;

export function desktopApiRequestHeaders(
  url: string,
  requestHeaders: RequestHeaders,
  apiOrigin = STUDYROOM_API_ORIGIN
): RequestHeaders {
  const headers = { ...requestHeaders };
  deleteHeader(headers, DESKTOP_CHANNEL_HEADER);
  const existingOrigin = headerValue(headers, "Origin");
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    if (existingOrigin === DESKTOP_ORIGIN) deleteHeader(headers, "Origin");
    return headers;
  }
  const normalizedApiOrigin = new URL(apiOrigin).origin;
  const isApiRequest = target.origin === normalizedApiOrigin
    && (target.pathname === "/api" || target.pathname.startsWith("/api/"));
  const isWebSocketRequest = target.host === new URL(normalizedApiOrigin).host
    && target.protocol === "wss:"
    && (target.pathname === "/ws" || target.pathname.startsWith("/ws/"));
  if (!isApiRequest && !isWebSocketRequest) {
    if (existingOrigin === DESKTOP_ORIGIN) deleteHeader(headers, "Origin");
    return headers;
  }
  deleteHeader(headers, "Origin");
  headers.Origin = DESKTOP_ORIGIN;
  if (isApiRequest) headers[DESKTOP_CHANNEL_HEADER] = DESKTOP_CHANNEL_VALUE;
  return headers;
}

export function configureApiRequestHeaders(targetSession: Session): void {
  targetSession.webRequest.onBeforeSendHeaders(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => callback({
      requestHeaders: desktopApiRequestHeaders(details.url, details.requestHeaders)
    })
  );
}

function deleteHeader(headers: RequestHeaders, name: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
}

function headerValue(headers: RequestHeaders, name: string): string | undefined {
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}
