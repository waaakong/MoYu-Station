import type { RadioNowPlaying, RadioStation, Track } from "@studyroom/contracts";
import { webRadioCatalog } from "../data/radioCatalog.generated";
import grooveSaladCover from "../assets/radio/groove-salad.svg";
import droneZoneCover from "../assets/radio/drone-zone.svg";
import secretAgentCover from "../assets/radio/secret-agent.svg";

const RADIO_COVERS: Record<string, string> = {
  "groove-salad": grooveSaladCover,
  "drone-zone": droneZoneCover,
  "secret-agent": secretAgentCover
};

export function radioArtworkUrl(station: RadioStation): string | undefined {
  return station.artworkToken ? RADIO_COVERS[station.artworkToken] : undefined;
}

export async function listRadioStations(): Promise<RadioStation[]> {
  if (window.studyRoomDesktop) return (await window.studyRoomDesktop.listRadioStations()).items;
  return webRadioCatalog.map(({ streamUrl: _streamUrl, ...station }) => station);
}

export async function resolveRadioPlaybackUrl(stationId: string): Promise<string> {
  if (window.studyRoomDesktop) {
    const descriptor = await window.studyRoomDesktop.prepareRadioPlayback({ stationId });
    return `studyroom-media://radio/${encodeURIComponent(descriptor.mediaToken)}`;
  }
  const station = webRadioCatalog.find(({ id }) => id === stationId);
  if (!station) throw new Error("RADIO_STATION_NOT_FOUND");
  return station.streamUrl;
}

export async function refreshRadioNowPlaying(stationId: string): Promise<RadioNowPlaying | undefined> {
  return await window.studyRoomDesktop?.refreshRadioNowPlaying({ stationId });
}

export function radioStationTrack(station: RadioStation): Track {
  return {
    id: `radio:${station.id}`,
    title: station.name,
    artist: `SomaFM · ${station.category}`,
    album: `公开电台 · Live · ${station.bitrateKbps ?? "?"} kbps`,
    artworkUrl: radioArtworkUrl(station),
    source: { kind: "radio", stationId: station.id }
  };
}
