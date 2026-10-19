import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isArtworkWithinLimits, readAudioMetadata } from "../src/audio/library/metadata";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("bounded local metadata", () => {
  it("reads standard title, artist and album tags", async () => {
    const root = mkdtempSync(join(tmpdir(), "studyroom-metadata-"));
    directories.push(root);
    const makeFrame = (id: string, value: string) => {
      const body = Buffer.concat([Buffer.from([3]), Buffer.from(value)]);
      const header = Buffer.alloc(10);
      header.write(id);
      header.writeUInt32BE(body.length, 4);
      return Buffer.concat([header, body]);
    };
    const frames = Buffer.concat([
      makeFrame("TIT2", "Tagged Song"),
      makeFrame("TPE1", "Tagged Artist"),
      makeFrame("TALB", "Tagged Album")
    ]);
    const size = Buffer.from([(frames.length >> 21) & 127, (frames.length >> 14) & 127, (frames.length >> 7) & 127, frames.length & 127]);
    const audioPath = join(root, "fallback.mp3");
    writeFileSync(audioPath, Buffer.concat([Buffer.from("ID3"), Buffer.from([3, 0, 0]), size, frames]));

    const result = await readAudioMetadata(audioPath, "fingerprint");
    expect(result).toMatchObject({ title: "Tagged Song", artist: "Tagged Artist", album: "Tagged Album", parseFailed: false });
  });

  it("keeps same-name LRC when an audio file has no usable tags", async () => {
    const root = mkdtempSync(join(tmpdir(), "studyroom-metadata-"));
    directories.push(root);
    const audioPath = join(root, "Artist - Song.mp3");
    writeFileSync(audioPath, "not a valid mp3");
    writeFileSync(join(root, "Artist - Song.lrc"), "[00:01.00]Stay focused");

    const result = await readAudioMetadata(audioPath, "fingerprint");
    expect(result.lyrics).toBe("[00:01.00]Stay focused");
    expect(result.lyricsSource).toBe("sidecar");
  });

  it("rejects oversized-pixel artwork before it reaches the cache", () => {
    const validPng = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(validPng);
    validPng.writeUInt32BE(1200, 16);
    validPng.writeUInt32BE(1200, 20);
    expect(isArtworkWithinLimits(validPng, "image/png")).toBe(true);

    const oversizedPng = Buffer.from(validPng);
    oversizedPng.writeUInt32BE(8000, 16);
    oversizedPng.writeUInt32BE(8000, 20);
    expect(isArtworkWithinLimits(oversizedPng, "image/png")).toBe(false);
    expect(isArtworkWithinLimits(Buffer.alloc(20), "image/icns")).toBe(false);
  });
});
