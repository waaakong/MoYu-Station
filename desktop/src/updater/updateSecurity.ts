import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import type { UpdateChannel } from "@studyroom/contracts";

const manifestFileSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  size: z.number().int().positive().max(1024 * 1024 * 1024),
  sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/),
  role: z.enum(["feed", "installer", "blockmap"])
}).strict();

const manifestFields = {
  releaseId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  channel: z.enum(["stable", "beta", "provider-experimental"]),
  version: z.string().min(5).max(64),
  platform: z.literal("win32"),
  arch: z.literal("x64"),
  appId: z.string().min(8).max(120),
  artifactKey: z.string().regex(/^(stable|beta|provider-experimental)\/[0-9A-Za-z.-]{5,64}$/),
  publishedAt: z.string().datetime({ offset: true }),
  files: z.array(manifestFileSchema).min(2).max(8)
};

export const releaseManifestSchema = z.discriminatedUnion('schemaVersion', [
  z.object({ ...manifestFields, schemaVersion: z.literal(1) }).strict(),
  z.object({ ...manifestFields, schemaVersion: z.literal(2), github: z.object({
    repository: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/),
    tag: z.string().regex(/^v[0-9A-Za-z][0-9A-Za-z.-]{4,63}$/)
  }).strict() }).strict()
]);

export type ReleaseManifest = z.infer<typeof releaseManifestSchema>;

export interface SignedManifestEnvelope {
  manifestJson: string;
  signature: string;
  keyId: string;
}

export interface ManifestExpectation {
  channel: UpdateChannel;
  version: string;
  appId: string;
  feedUrl: string;
  updateOrigin: string;
}

export function expectedAppId(channel: UpdateChannel): string {
  if (channel === "stable") return "xyz.moyustation.studyroom";
  if (channel === "beta") return "xyz.moyustation.studyroom.beta";
  return "xyz.moyustation.studyroom.provider-experimental";
}

export function verifySignedManifest(
  envelope: SignedManifestEnvelope,
  publicKeys: Readonly<Record<string, string>>,
  expected: ManifestExpectation
): ReleaseManifest {
  const encodedKey = publicKeys[envelope.keyId];
  if (!encodedKey) throw new Error("UPDATE_MANIFEST_KEY_UNKNOWN");
  let signature: Buffer;
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    signature = Buffer.from(envelope.signature, "base64");
    publicKey = createPublicKey({ key: Buffer.from(encodedKey, "base64"), format: "der", type: "spki" });
  } catch {
    throw new Error("UPDATE_MANIFEST_KEY_INVALID");
  }
  const valid = verify(null, Buffer.from(envelope.manifestJson, "utf8"), publicKey, signature);
  if (!valid) throw new Error("UPDATE_MANIFEST_SIGNATURE_INVALID");

  let manifest: ReleaseManifest;
  try {
    manifest = releaseManifestSchema.parse(JSON.parse(envelope.manifestJson));
  } catch {
    throw new Error("UPDATE_MANIFEST_INVALID");
  }
  if (manifest.channel !== expected.channel || manifest.version !== expected.version || manifest.appId !== expected.appId) {
    throw new Error("UPDATE_MANIFEST_MISMATCH");
  }
  if (manifest.artifactKey !== `${manifest.channel}/${manifest.version}`) throw new Error("UPDATE_MANIFEST_PATH_INVALID");
  if (manifest.releaseId !== `${manifest.channel}-${manifest.version}`) throw new Error("UPDATE_MANIFEST_MISMATCH");
  if (manifest.files.filter((file) => file.role === "feed").length !== 1 || manifest.files.filter((file) => file.role === "installer").length !== 1) {
    throw new Error("UPDATE_MANIFEST_FILES_INVALID");
  }
  const names = new Set<string>();
  for (const file of manifest.files) {
    const roleMatches = (file.role === "feed" && file.name === "latest.yml")
      || (file.role === "installer" && file.name.toLowerCase().endsWith(".exe"))
      || (file.role === "blockmap" && file.name.toLowerCase().endsWith(".blockmap"));
    if (!roleMatches || names.has(file.name)) throw new Error("UPDATE_MANIFEST_FILES_INVALID");
    names.add(file.name);
  }
  const feed = new URL(expected.feedUrl);
  if (manifest.schemaVersion === 2 && manifest.github.tag !== `v${manifest.version}`) throw new Error('UPDATE_MANIFEST_MISMATCH');
  const githubFeed = manifest.schemaVersion === 2 && expected.feedUrl ===
    `https://github.com/${manifest.github.repository}/releases/download/${manifest.github.tag}/`;
  const serverFeed = feed.origin === expected.updateOrigin && feed.pathname === `/private-updates/releases/${manifest.artifactKey}/`;
  if (feed.protocol !== "https:" || feed.username || feed.password || feed.search || feed.hash || (!githubFeed && !serverFeed)) {
    throw new Error("UPDATE_FEED_URL_BLOCKED");
  }
  return manifest;
}

export function parsePublicKeys(value: string): Readonly<Record<string, string>> {
  if (!value) return Object.freeze({});
  try {
    const parsed = z.record(z.string(), z.string().min(40)).parse(JSON.parse(value));
    return Object.freeze({ ...parsed });
  } catch {
    return Object.freeze({});
  }
}
