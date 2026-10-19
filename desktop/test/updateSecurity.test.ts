import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { expectedAppId, verifySignedManifest } from "../src/updater/updateSecurity";

function signedManifest(overrides: Record<string, unknown> = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const manifest = {
    schemaVersion: 1,
    releaseId: "stable-0.1.1",
    channel: "stable",
    version: "0.1.1",
    platform: "win32",
    arch: "x64",
    appId: "xyz.moyustation.studyroom",
    artifactKey: "stable/0.1.1",
    publishedAt: "2026-09-15T08:00:00.000Z",
    files: [
      { name: "latest.yml", size: 120, sha512: Buffer.alloc(64, 1).toString("base64"), role: "feed" },
      { name: "StudyRoom-stable-0.1.1-x64.exe", size: 1000, sha512: Buffer.alloc(64, 2).toString("base64"), role: "installer" }
    ],
    ...overrides
  };
  const manifestJson = JSON.stringify(manifest);
  return {
    envelope: {
      manifestJson,
      signature: sign(null, Buffer.from(manifestJson), privateKey).toString("base64"),
      keyId: "test-2026"
    },
    keys: {
      "test-2026": publicKey.export({ format: "der", type: "spki" }).toString("base64")
    }
  };
}

describe("private update manifest security", () => {
  it("accepts a signed manifest bound to the expected channel and feed", () => {
    const fixture = signedManifest();
    const manifest = verifySignedManifest(fixture.envelope, fixture.keys, {
      channel: "stable",
      version: "0.1.1",
      appId: expectedAppId("stable"),
      feedUrl: "https://moyustation.xyz/private-updates/releases/stable/0.1.1/",
      updateOrigin: "https://moyustation.xyz"
    });
    expect(manifest.releaseId).toBe("stable-0.1.1");
  });

  it("rejects manifest tampering, cross-channel reuse and foreign feed origins", () => {
    const fixture = signedManifest();
    expect(() => verifySignedManifest(
      { ...fixture.envelope, manifestJson: fixture.envelope.manifestJson.replace("0.1.1", "0.1.2") },
      fixture.keys,
      { channel: "stable", version: "0.1.2", appId: expectedAppId("stable"), feedUrl: "https://moyustation.xyz/private-updates/releases/stable/0.1.2/", updateOrigin: "https://moyustation.xyz" }
    )).toThrow("UPDATE_MANIFEST_SIGNATURE_INVALID");
    expect(() => verifySignedManifest(fixture.envelope, fixture.keys, {
      channel: "beta", version: "0.1.1", appId: expectedAppId("beta"), feedUrl: "https://moyustation.xyz/private-updates/releases/beta/0.1.1/", updateOrigin: "https://moyustation.xyz"
    })).toThrow("UPDATE_MANIFEST_MISMATCH");
    expect(() => verifySignedManifest(fixture.envelope, fixture.keys, {
      channel: "stable", version: "0.1.1", appId: expectedAppId("stable"), feedUrl: "https://evil.example/private-updates/releases/stable/0.1.1/", updateOrigin: "https://moyustation.xyz"
    })).toThrow("UPDATE_FEED_URL_BLOCKED");
  });
});
