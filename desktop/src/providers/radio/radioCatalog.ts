import type { RadioStation } from "@studyroom/contracts";

export interface InternalRadioStation extends RadioStation {
  streamUrl: URL;
  metadataUrl: URL;
  allowedHosts: readonly string[];
}

export const RADIO_STATIONS: readonly InternalRadioStation[] = Object.freeze([
  {
    id: "somafm-groove-salad", name: "Groove Salad", category: "氛围电子", region: "US",
    format: "mp3", bitrateKbps: 128,
    artworkToken: "groove-salad",
    streamUrl: new URL("https://ice5.somafm.com/groovesalad-128-mp3"),
    metadataUrl: new URL("https://somafm.com/songs/groovesalad.json"),
    allowedHosts: ["somafm.com"]
  },
  {
    id: "somafm-drone-zone", name: "Drone Zone", category: "深度专注", region: "US",
    format: "mp3", bitrateKbps: 128,
    artworkToken: "drone-zone",
    streamUrl: new URL("https://ice5.somafm.com/dronezone-128-mp3"),
    metadataUrl: new URL("https://somafm.com/songs/dronezone.json"),
    allowedHosts: ["somafm.com"]
  },
  {
    id: "somafm-secret-agent", name: "Secret Agent", category: "复古电影", region: "US",
    format: "mp3", bitrateKbps: 128,
    artworkToken: "secret-agent",
    streamUrl: new URL("https://ice5.somafm.com/secretagent-128-mp3"),
    metadataUrl: new URL("https://somafm.com/songs/secretagent.json"),
    allowedHosts: ["somafm.com"]
  }
]);

export function publicRadioStation(station: InternalRadioStation): RadioStation {
  const { streamUrl: _streamUrl, metadataUrl: _metadataUrl, allowedHosts: _allowedHosts, ...publicStation } = station;
  return publicStation;
}
