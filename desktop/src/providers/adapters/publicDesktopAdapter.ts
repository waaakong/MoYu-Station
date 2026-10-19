import type { ProviderCapability, ProviderTrackRef } from "@studyroom/contracts";
import type { ProviderOperationContext, ProviderPlaybackInput } from "../core/providerAdapter";
import { ProviderError } from "../core/providerErrors";
import { WorkerProviderAdapter } from "./workerProviderAdapter";

/** Deliberately anonymous: account/library support is not implied by search. */
export class PublicDesktopAdapter extends WorkerProviderAdapter {
  readonly supportsLogin = false;
  override get capabilities(): readonly ProviderCapability[] {
    return this.providerId === "qq" ? ["search", "playback"] : ["search"];
  }
  override async accountSummary(_context: ProviderOperationContext) { return undefined; }
  async trackDetails(trackId: string, context: ProviderOperationContext): Promise<ProviderTrackRef | undefined> {
    if (this.providerId !== "qq") throw new ProviderError("PROVIDER_DISABLED");
    return this.worker.request("trackDetails", { trackId }, context.signal);
  }
  override async resolvePlayback(input: ProviderPlaybackInput, context: ProviderOperationContext) {
    if (this.providerId !== "qq") throw new ProviderError("PROVIDER_DISABLED");
    const value = await this.worker.request<{ providerId: string; trackId: string; url: string; expiresAt: number }>("resolvePlayback", input, context.signal);
    let url: URL;
    try { url = new URL(value.url); } catch { throw new ProviderError("PROVIDER_API_CHANGED"); }
    const hosts = ["aqqmusic.tc.qq.com", "dl.stream.qqmusic.qq.com", "isure.stream.qqmusic.qq.com", "ws.stream.qqmusic.qq.com"];
    if (value.providerId !== "qq" || value.trackId !== input.trackId || url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname) || !/^\/(?:C400|M500)[A-Za-z0-9]+\.(?:m4a|mp3)$/.test(url.pathname) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw new ProviderError("PROVIDER_API_CHANGED");
    return { providerId: "qq" as const, trackId: input.trackId, url, expiresAt: Math.min(value.expiresAt, Date.now() + 300_000), allowedHosts: [url.hostname], accountScope: "qq:public" };
  }
}
