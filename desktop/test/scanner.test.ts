import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanAudioDirectory } from "../src/audio/library/scanner";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("local library scanner", () => {
  it("indexes supported nested files and ignores unrelated content", async () => {
    const root = mkdtempSync(join(tmpdir(), "studyroom-scan-"));
    directories.push(root);
    mkdirSync(join(root, "album"));
    writeFileSync(join(root, "album", "Artist - Quiet Track.flac"), "audio");
    writeFileSync(join(root, "notes.txt"), "not music");
    const result = await scanAudioDirectory(root, {
      readMetadata: async () => ({ album: "Stillness", durationMs: 61_000, parseFailed: false })
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ title: "Quiet Track", artist: "Artist", album: "Stillness", durationMs: 61_000, size: 5 });
    expect(result.files[0]?.quickSignature).toMatch(/^[a-f0-9]{64}$/);
    expect(result.skipped).toBe(1);
    expect(result.complete).toBe(true);
    expect(result.metadataWarnings).toBe(0);
  });

  it("honors cancellation before traversing", async () => {
    const root = mkdtempSync(join(tmpdir(), "studyroom-scan-"));
    directories.push(root);
    const controller = new AbortController();
    controller.abort();
    await expect(scanAudioDirectory(root, controller.signal)).rejects.toThrow("LIBRARY_SCAN_CANCELED");
  });
});
