import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createReleaseEnvelope } from "./create-update-release.mjs";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "studyroom-release-"));
  const keys = generateKeyPairSync("ed25519");
  const keyPath = join(directory, "offline-key.pem");
  await writeFile(keyPath, keys.privateKey.export({ type: "pkcs8", format: "pem" }));
  const bytes = Buffer.from('synthetic installer');
  await writeFile(join(directory, "latest.yml"), JSON.stringify({version:'1.2.3',path:'StudyRoom.exe',files:[{
    url:'StudyRoom.exe',size:bytes.length,sha512:createHash('sha512').update(bytes).digest('base64')
  }]}));
  await writeFile(join(directory, "StudyRoom.exe"), bytes);
  return { directory, keyPath, publicKey: keys.publicKey };
}

test("creates a channel-bound manifest and valid Ed25519 signature", async () => {
  const data = await fixture();
  try {
    const result = await createReleaseEnvelope({ channel: "stable", version: "1.2.3", directory: data.directory, privateKeyPath: data.keyPath, keyId: "test-2026", publishedAt: "2026-09-15T08:00:00.000Z" });
    assert.equal(result.manifest.artifactKey, "stable/1.2.3");
    assert.equal(result.manifest.files.length, 2);
    assert.equal(verify(null, Buffer.from(result.manifestJson), data.publicKey, Buffer.from(result.signature, "base64")), true);
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});

test('signs an exact GitHub repository and tag, rejecting mismatched feed bytes', async () => {
  const data = await fixture();
  const input = {channel:'stable',version:'1.2.3',directory:data.directory,privateKeyPath:data.keyPath,keyId:'test',githubRepository:'waaakong/StudyRoom'};
  try {
    const result = await createReleaseEnvelope(input);
    assert.equal(result.manifest.schemaVersion, 2);
    assert.deepEqual(result.manifest.github, {repository:'waaakong/StudyRoom',tag:'v1.2.3'});
    await assert.rejects(() => createReleaseEnvelope({...input,githubRepository:'../../evil'}), /REPOSITORY_INVALID/);
    await writeFile(join(data.directory,'StudyRoom.exe'),'tampered');
    await assert.rejects(() => createReleaseEnvelope(input), /FEED_MISMATCH/);
  } finally { await rm(data.directory, {recursive:true,force:true}); }
});

test("rejects a version that belongs to another channel", async () => {
  const data = await fixture();
  try {
    await assert.rejects(() => createReleaseEnvelope({ channel: "beta", version: "1.2.3", directory: data.directory, privateKeyPath: data.keyPath, keyId: "test" }), /UPDATE_RELEASE_VERSION_INVALID/);
  } finally { await rm(data.directory, { recursive: true, force: true }); }
});
