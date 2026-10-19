import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fullContentHash, quickContentSignature } from "../src/audio/library/contentFingerprint";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("content fingerprints", () => {
  it("is stable for identical content and separates different content", async () => {
    const root = mkdtempSync(join(tmpdir(), "studyroom-fingerprint-"));
    directories.push(root);
    const first = join(root, "first.mp3");
    const copy = join(root, "copy.mp3");
    const different = join(root, "different.mp3");
    writeFileSync(first, Buffer.alloc(200_000, 7));
    writeFileSync(copy, Buffer.alloc(200_000, 7));
    writeFileSync(different, Buffer.alloc(200_000, 8));

    expect(await quickContentSignature(first)).toBe(await quickContentSignature(copy));
    expect(await fullContentHash(first)).toBe(await fullContentHash(copy));
    expect(await quickContentSignature(first)).not.toBe(await quickContentSignature(different));
  });
});
