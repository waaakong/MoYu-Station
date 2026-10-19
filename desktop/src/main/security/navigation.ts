import type { WebContents } from "electron";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "8.163.29.26",
  "moyustation.xyz",
  "www.moyustation.xyz",
  "music.163.com",
  "y.qq.com",
  "github.com"
]);

export function validateExternalUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EXTERNAL_URL_INVALID");
  }
  if (url.protocol !== "https:" || !ALLOWED_EXTERNAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("EXTERNAL_URL_BLOCKED");
  }
  return url;
}

function isSameRendererTarget(current: string, target: string): boolean {
  try {
    const currentUrl = new URL(current);
    const targetUrl = new URL(target);
    if (currentUrl.protocol === "file:" && targetUrl.protocol === "file:") {
      return currentUrl.pathname === targetUrl.pathname;
    }
    return currentUrl.origin === targetUrl.origin
      && ["localhost", "127.0.0.1"].includes(targetUrl.hostname);
  } catch {
    return false;
  }
}

export function configureNavigationSecurity(
  contents: WebContents,
  openExternal: (url: string) => Promise<unknown>
): void {
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const validated = validateExternalUrl(url);
      void openExternal(validated.href);
    } catch {
      // Block silently; the renderer can surface a controlled error through IPC.
    }
    return { action: "deny" };
  });

  contents.on("will-navigate", (event, targetUrl) => {
    if (!isSameRendererTarget(contents.getURL(), targetUrl)) event.preventDefault();
  });
}
