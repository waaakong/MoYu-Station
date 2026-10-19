import { normalizeDesktopCloudOrigin } from "../config/cloudEndpoint";

export function cloudMediaUrl(value?: string | null): string {
  if (!value) return "";
  if (!window.studyRoomDesktop?.cloud) return /^(https?:|blob:|data:|\/)/i.test(value) ? value : `/${value}`;
  if (/^(blob:|data:|studyroom-media:)/i.test(value)) return value;
  let path = value.startsWith("uploads/") ? `/${value}` : value;
  if (/^https:/i.test(path)) {
    try {
      const url = new URL(path);
      if (url.origin !== normalizeDesktopCloudOrigin() || url.search || url.hash || url.username || url.password) return "";
      path = url.pathname;
    } catch { return ""; }
  }
  const controlledAsset = /^\/api\/media\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(clear|thumb|display)$/.test(path);
  if (!controlledAsset && !/^\/uploads\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/.test(path)) return "";
  return `studyroom-media://cloud${path}`;
}
