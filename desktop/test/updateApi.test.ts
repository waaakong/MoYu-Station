import { describe, expect, it, vi } from "vitest";
import { requestUpdateOffer } from "../src/updater/updateApi";

const success = {
  success: true,
  data: {
    status: "not-available",
    message: "已是最新版",
    currentVersion: "1.0.0",
    channel: "stable",
    mandatory: false
  }
};

describe("private update check transport", () => {
  it("uses the pinned API origin, session credentials and no redirects", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(success), { status: 200, headers: { "Content-Type": "application/json" } }));
    await requestUpdateOffer({ apiBaseUrl: "https://updates.test/api", allowedApiOrigin: "https://updates.test", currentVersion: "1.0.0", channel: "stable", fetcher });
    expect(fetcher).toHaveBeenCalledWith(new URL("https://updates.test/api/client-updates/check"), expect.objectContaining({ credentials: "include", redirect: "error" }));
  });

  it("rejects a cross-origin API base before a request is sent", async () => {
    const fetcher = vi.fn();
    await expect(requestUpdateOffer({ apiBaseUrl: "https://evil.test/api", allowedApiOrigin: "https://updates.test", currentVersion: "1.0.0", channel: "stable", fetcher })).rejects.toThrow("UPDATE_API_URL_BLOCKED");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
