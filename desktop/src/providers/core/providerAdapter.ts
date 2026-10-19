import type {
  PlaybackRights,
  ProviderAccountSummary,
  ProviderCapability,
  ProviderId,
  ProviderPlaylistPage,
  ProviderPlaybackDescriptor,
  ProviderSearchPage,
  ProviderTrackRef,
  TrackLyrics
} from "@studyroom/contracts";

export interface ProviderOperationContext {
  signal: AbortSignal;
  correlationId: string;
}

export interface ProviderPageInput {
  cursor?: string;
  pageSize: number;
}

export interface ProviderSearchInput extends ProviderPageInput {
  query: string;
}

export interface ProviderPlaybackInput {
  trackId: string;
  playbackSessionId: string;
  accountScope: string;
}

export interface InternalPlaybackSource {
  providerId: ProviderId;
  trackId: string;
  url: URL;
  expiresAt: number;
  mimeType?: string;
  requestHeaders?: Readonly<Record<string, string>>;
  allowedHosts: readonly string[];
  accountScope?: string;
}

export interface ProviderAdapter {
  readonly providerId: ProviderId;
  readonly capabilities: readonly ProviderCapability[];
  readonly supportsLogin?: boolean;
  readonly blockedReason?: "PROVIDER_API_CHANGED" | "PROVIDER_UNAVAILABLE";
  accountSummary(context: ProviderOperationContext): Promise<ProviderAccountSummary | undefined>;
  cachedAccount?(): ProviderAccountSummary;
  search(input: ProviderSearchInput, context: ProviderOperationContext): Promise<ProviderTrackRef[]>;
  searchPage?(input: ProviderSearchInput, context: ProviderOperationContext): Promise<ProviderSearchPage>;
  /** Revalidate an exact persisted track with the current platform session. */
  trackDetails?(trackId: string, context: ProviderOperationContext): Promise<ProviderTrackRef | undefined>;
  recommendations(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage>;
  playlists(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderPlaylistPage>;
  favorites(input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage>;
  playlistTracks(playlistId: string, input: ProviderPageInput, context: ProviderOperationContext): Promise<ProviderSearchPage>;
  lyrics(trackId: string, context: ProviderOperationContext): Promise<TrackLyrics | undefined>;
  resolvePlayback(input: ProviderPlaybackInput, context: ProviderOperationContext): Promise<InternalPlaybackSource>;
  logout(): Promise<void>;
  dispose(): Promise<void>;
}

export interface RawProviderTrack {
  providerId: ProviderId;
  trackId: string;
  title: string;
  artists: string[];
  album?: string;
  artworkUrl?: string;
  durationMs?: number;
  isrc?: string;
  quality?: ProviderTrackRef["quality"];
  rights?: PlaybackRights;
  badges?: ProviderTrackRef["badges"];
  available?: boolean;
}

export type ProviderAdapterFactory = () => ProviderAdapter;

export function disabledProviderPage(providerId: ProviderId): ProviderSearchPage {
  return { providerId, items: [], fromCache: false };
}

export function playbackDescriptor(source: InternalPlaybackSource, mediaToken: string): ProviderPlaybackDescriptor {
  return {
    sourceKind: "provider",
    providerId: source.providerId,
    trackId: source.trackId,
    mediaToken,
    expiresAt: source.expiresAt,
    supportsRange: true
  };
}
