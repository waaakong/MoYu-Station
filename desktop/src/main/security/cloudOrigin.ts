declare const __STUDYROOM_CLOUD_ORIGIN__: string;
declare const __STUDYROOM_DESKTOP_ORIGIN__: string;

const DEFAULT_CLOUD_ORIGIN = "https://moyustation.xyz";
const DEFAULT_DESKTOP_ORIGIN = "https://desktop.moyustation.xyz";

export function normalizeCloudOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("STUDYROOM_CLOUD_ORIGIN_INVALID");
  }
  return url.origin;
}

const configuredCloudOrigin = typeof __STUDYROOM_CLOUD_ORIGIN__ === "undefined"
  ? DEFAULT_CLOUD_ORIGIN
  : __STUDYROOM_CLOUD_ORIGIN__;

export const STUDYROOM_CLOUD_ORIGIN = normalizeCloudOrigin(configuredCloudOrigin);

const configuredDesktopOrigin = typeof __STUDYROOM_DESKTOP_ORIGIN__ === "undefined"
  ? DEFAULT_DESKTOP_ORIGIN
  : __STUDYROOM_DESKTOP_ORIGIN__;

export const STUDYROOM_DESKTOP_ORIGIN = normalizeCloudOrigin(configuredDesktopOrigin);

export function studyRoomWebSocketOrigin(origin = STUDYROOM_CLOUD_ORIGIN): string {
  const url = new URL(origin);
  url.protocol = "wss:";
  return url.origin;
}
