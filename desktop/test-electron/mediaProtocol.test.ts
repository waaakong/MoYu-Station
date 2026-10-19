import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMediaResponse } from "../src/audio/protocol/mediaProtocol";
import type { LocalDatabaseStore } from "../src/database/database";

test("serves bounded byte ranges without accepting arbitrary tokens", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studyroom-media-test-"));
  try {
    const audioPath = join(directory, "track.mp3");
    writeFileSync(audioPath, "0123456789");
    const database = {
      resolveLocalFile: (token: string) => token === "00000000-0000-4000-8000-000000000000" ? audioPath : undefined
    } as LocalDatabaseStore;
    const response = createMediaResponse(new Request(
      "studyroom-media://track/00000000-0000-4000-8000-000000000000",
      { headers: { Range: "bytes=2-5" } }
    ), database);
    assert.equal(response.status, 206);
    assert.equal(await response.text(), "2345");
    assert.equal(createMediaResponse(new Request("studyroom-media://track/../../track.mp3"), database).status, 404);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("serves allowlisted private artwork and rejects an unsafe MIME type", async () => {
  const directory = mkdtempSync(join(tmpdir(), "studyroom-artwork-test-"));
  try {
    const artworkPath = join(directory, "cover.jpg");
    writeFileSync(artworkPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const token = "11111111-1111-4111-a111-111111111111";
    const database = {
      resolveArtworkFile: (input: string) => input === token ? { path: artworkPath, mimeType: "image/jpeg" } : undefined
    } as LocalDatabaseStore;
    const response = createMediaResponse(new Request(`studyroom-media://artwork/${token}`), database);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal((await response.arrayBuffer()).byteLength, 4);

    const unsafeDatabase = { resolveArtworkFile: () => ({ path: artworkPath, mimeType: "text/html" }) } as unknown as LocalDatabaseStore;
    assert.equal(createMediaResponse(new Request(`studyroom-media://artwork/${token}`), unsafeDatabase).status, 404);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
