import { WEB_CAPABILITIES } from "@studyroom/contracts";

export const webAdapter = Object.freeze({
  kind: "web" as const,
  async getCapabilities() {
    return WEB_CAPABILITIES;
  },
  async openExternal(url: string): Promise<void> {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("仅允许打开 HTTP 或 HTTPS 链接");
    }
    window.open(parsed.href, "_blank", "noopener,noreferrer");
  }
});
