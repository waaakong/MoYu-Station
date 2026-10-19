const DEFAULT_DESKTOP_CLOUD_ORIGIN = "https://moyustation.xyz";

export function normalizeDesktopCloudOrigin(
  value = (typeof window !== "undefined" && window.studyRoomDesktop?.cloud?.origin) || import.meta.env.VITE_DESKTOP_CLOUD_ORIGIN || DEFAULT_DESKTOP_CLOUD_ORIGIN
): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error("DESKTOP_CLOUD_ORIGIN_INVALID");
  }
  return url.origin;
}

export function desktopApiBaseUrl(origin = normalizeDesktopCloudOrigin()): string {
  return `${origin}/api`;
}

export function desktopWebSocketUrl(path: string, origin = normalizeDesktopCloudOrigin()): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
  url.protocol = "wss:";
  return url.href;
}
