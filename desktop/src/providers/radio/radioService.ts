import { randomUUID } from "node:crypto";
import type { PlaybackDescriptor, RadioNowPlaying, RadioStationPage } from "@studyroom/contracts";
import type { RadioStationListRequest } from "@studyroom/contracts";
import { RemoteMediaSessionRegistry } from "../../audio/protocol/remoteMediaProtocol";
import { publicRadioStation, RADIO_STATIONS, type InternalRadioStation } from "./radioCatalog";
import { assertSafeRadioUrl, type AddressResolver } from "./ssrfGuard";

export class RadioService {
  constructor(
    private readonly media: RemoteMediaSessionRegistry,
    private readonly resolver?: AddressResolver,
    private readonly fetcher: typeof fetch = fetch
  ) {}

  list(request: RadioStationListRequest = {}): RadioStationPage {
    const query = request.query?.toLocaleLowerCase();
    const filtered = RADIO_STATIONS.filter((station) =>
      (!request.category || station.category === request.category)
      && (!query || `${station.name} ${station.category}`.toLocaleLowerCase().includes(query))
    );
    const offset = request.cursor ? Number(request.cursor) : 0;
    const pageSize = Math.min(50, request.pageSize ?? 30);
    const items = filtered.slice(offset, offset + pageSize).map(publicRadioStation);
    const next = offset + items.length;
    return { items, nextCursor: next < filtered.length ? String(next) : undefined };
  }

  async prepare(stationId: string): Promise<PlaybackDescriptor> {
    const station = this.station(stationId);
    await assertSafeRadioUrl(station.streamUrl, station.allowedHosts, this.resolver);
    const playbackSessionId = randomUUID();
    const mediaToken = this.media.issue({
      kind: "radio", ownerId: station.id, trackId: station.id, playbackSessionId, accountScope: "public",
      url: station.streamUrl, expiresAt: Date.now() + 5 * 60_000, allowedHosts: station.allowedHosts
    });
    return { sourceKind: "radio", mediaToken, expiresAt: Date.now() + 5 * 60_000, supportsRange: true };
  }

  async nowPlaying(stationId: string): Promise<RadioNowPlaying | undefined> {
    const station = this.station(stationId);
    await assertSafeRadioUrl(station.metadataUrl, station.allowedHosts, this.resolver);
    const response = await this.fetcher(station.metadataUrl, { redirect: "error", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return undefined;
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 256 * 1024) return undefined;
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > 256 * 1024) return undefined;
    const parsed = JSON.parse(text) as { songs?: Array<{ title?: unknown; artist?: unknown }> };
    const song = parsed.songs?.[0];
    if (!song) return undefined;
    return {
      stationId,
      title: typeof song.title === "string" ? song.title.slice(0, 500) : undefined,
      artist: typeof song.artist === "string" ? song.artist.slice(0, 500) : undefined,
      updatedAt: Date.now()
    };
  }

  private station(stationId: string): InternalRadioStation {
    const station = RADIO_STATIONS.find((entry) => entry.id === stationId);
    if (!station) throw new Error("RADIO_STATION_NOT_FOUND");
    return station;
  }
}
