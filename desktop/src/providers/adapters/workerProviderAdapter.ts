import type {
  ProviderAccountSummary,
  ProviderCapability,
  ProviderId,
  ProviderPlaylistPage,
  ProviderSearchPage,
  ProviderTrackRef,
  TrackLyrics
} from "@studyroom/contracts";
import type {
  InternalPlaybackSource,
  ProviderAdapter,
  ProviderOperationContext,
  ProviderPageInput,
  ProviderPlaybackInput,
  ProviderSearchInput
} from "../core/providerAdapter";
import type { ProviderWorkerSupervisor } from "../core/providerWorkerSupervisor";

const ALL_CAPABILITIES: readonly ProviderCapability[] = ["search", "recommendations", "playlists", "favorites", "lyrics", "playback"];

export class WorkerProviderAdapter implements ProviderAdapter {
  get capabilities(): readonly ProviderCapability[] { return ALL_CAPABILITIES; }

  constructor(
    readonly providerId: ProviderId,
    protected readonly worker: ProviderWorkerSupervisor,
    readonly blockedReason?: "PROVIDER_API_CHANGED" | "PROVIDER_UNAVAILABLE"
  ) {}

  accountSummary(context: ProviderOperationContext): Promise<ProviderAccountSummary | undefined> {
    return this.worker.request("ping", undefined, context.signal).then(() => undefined);
  }
  search(input: ProviderSearchInput, context: ProviderOperationContext): Promise<ProviderTrackRef[]> {
    return this.worker.request("search", input, context.signal);
  }
  recommendations(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage> {
    return this.worker.request("recommendations", input, context.signal);
  }
  playlists(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderPlaylistPage> {
    return this.worker.request("playlists", input, context.signal);
  }
  favorites(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage> {
    return this.worker.request("favorites", input, context.signal);
  }
  playlistTracks(playlistId: string, input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage> {
    return this.worker.request("playlistTracks", { playlistId, ...input }, context.signal);
  }
  lyrics(trackId: string, context: ProviderOperationContext): Promise<TrackLyrics | undefined> {
    return this.worker.request("lyrics", { trackId }, context.signal);
  }
  resolvePlayback(input: ProviderPlaybackInput, context: ProviderOperationContext): Promise<InternalPlaybackSource> {
    return this.worker.request("resolvePlayback", input, context.signal);
  }
  async logout(): Promise<void> { this.worker.dispose(); }
  async dispose(): Promise<void> { this.worker.dispose(); }
}
