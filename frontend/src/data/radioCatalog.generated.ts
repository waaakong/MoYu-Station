import type { RadioStation } from "@studyroom/contracts";

export interface WebRadioStation extends RadioStation { streamUrl: string }

export const webRadioCatalog: readonly WebRadioStation[] = Object.freeze([
  { id: "somafm-groove-salad", name: "Groove Salad", category: "氛围电子", region: "US", format: "mp3", bitrateKbps: 128, artworkToken: "groove-salad", streamUrl: "https://ice5.somafm.com/groovesalad-128-mp3" },
  { id: "somafm-drone-zone", name: "Drone Zone", category: "深度专注", region: "US", format: "mp3", bitrateKbps: 128, artworkToken: "drone-zone", streamUrl: "https://ice5.somafm.com/dronezone-128-mp3" },
  { id: "somafm-secret-agent", name: "Secret Agent", category: "复古电影", region: "US", format: "mp3", bitrateKbps: 128, artworkToken: "secret-agent", streamUrl: "https://ice5.somafm.com/secretagent-128-mp3" }
]);
