import { createHash, createPrivateKey, sign } from "node:crypto";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import yaml from 'js-yaml';

const CHANNELS = new Set(["stable", "beta", "provider-experimental"]);
const APP_IDS = {
  stable: "xyz.moyustation.studyroom",
  beta: "xyz.moyustation.studyroom.beta",
  "provider-experimental": "xyz.moyustation.studyroom.provider-experimental"
};

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) result[argv[index]?.replace(/^--/, "")] = argv[index + 1];
  return result;
}

function assertReleaseVersion(channel, version) {
  const patterns = {
    stable: /^\d+\.\d+\.\d+(?:-trial\.\d{8}\.[1-9]\d*)?$/,
    beta: /^\d+\.\d+\.\d+-beta\.\d+$/,
    "provider-experimental": /^\d+\.\d+\.\d+-exp\.\d+$/
  };
  if (!patterns[channel]?.test(version)) throw new Error("UPDATE_RELEASE_VERSION_INVALID");
}

async function fileEntry(directory, name, role) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name)) throw new Error("UPDATE_RELEASE_FILENAME_INVALID");
  const target = resolve(directory, name);
  const stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("UPDATE_RELEASE_FILE_INVALID");
  const contents = await readFile(target);
  return { name, size: stat.size, sha512: createHash("sha512").update(contents).digest("base64"), role };
}

export async function createReleaseEnvelope(input) {
  if (!CHANNELS.has(input.channel)) throw new Error("UPDATE_RELEASE_CHANNEL_INVALID");
  assertReleaseVersion(input.channel, input.version);
  const directory = resolve(input.directory);
  const names = await readdir(directory);
  const feed = names.filter((name) => name === 'latest.yml');
  const installer = names.filter((name) => name.toLowerCase().endsWith(".exe"));
  if (feed.length !== 1 || installer.length !== 1) throw new Error("UPDATE_RELEASE_FILES_AMBIGUOUS");
  const blockmaps = names.filter((name) => name.toLowerCase().endsWith(".blockmap"));
  const files = [
    await fileEntry(directory, feed[0], "feed"),
    await fileEntry(directory, installer[0], "installer"),
    ...await Promise.all(blockmaps.slice(0, 6).map((name) => fileEntry(directory, name, "blockmap")))
  ];
  // Never sign a feed pointing at another version, URL, size or installer digest.
  const metadata = yaml.load(await readFile(resolve(directory, feed[0]), 'utf8'));
  const exe = files.find(file => file.role === 'installer');
  if (!metadata || metadata.version !== input.version || metadata.packages || !Array.isArray(metadata.files) || metadata.files.length !== 1
      || metadata.files[0].url !== exe.name || metadata.files[0].sha512 !== exe.sha512 || metadata.files[0].size !== exe.size
      || (metadata.path !== undefined && metadata.path !== exe.name) || (metadata.sha512 !== undefined && metadata.sha512 !== exe.sha512)) {
    throw new Error('UPDATE_RELEASE_FEED_MISMATCH');
  }
  const publishedAt = input.publishedAt || new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    releaseId: `${input.channel}-${input.version}`,
    channel: input.channel,
    version: input.version,
    platform: "win32",
    arch: "x64",
    appId: APP_IDS[input.channel],
    artifactKey: `${input.channel}/${input.version}`,
    publishedAt,
    files
  };
  if (input.githubRepository) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.githubRepository)) throw new Error('UPDATE_RELEASE_REPOSITORY_INVALID');
    manifest.schemaVersion = 2;
    manifest.github = { repository: input.githubRepository, tag: `v${input.version}` };
  }
  const manifestJson = JSON.stringify(manifest);
  const privateKey = createPrivateKey(await readFile(resolve(input.privateKeyPath)));
  if (privateKey.asymmetricKeyType !== 'ed25519' || !/^[A-Za-z0-9._-]{1,64}$/.test(input.keyId || '')) throw new Error('UPDATE_RELEASE_KEY_INVALID');
  const signature = sign(null, Buffer.from(manifestJson, "utf8"), privateKey).toString("base64");
  return { manifest, manifestJson, signature, keyId: input.keyId };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.channel || !args.version || !args.directory || !args["private-key"] || !args["key-id"]) {
    throw new Error("Usage: --channel --version --directory --private-key --key-id");
  }
  const directory = resolve(args.directory);
  const envelope = await createReleaseEnvelope({
    channel: args.channel,
    version: args.version,
    directory,
    privateKeyPath: args["private-key"],
    keyId: args["key-id"],
    githubRepository: args['github-repository']
  });
  await writeFile(resolve(directory, "release.json"), envelope.manifestJson, { encoding: "utf8", flag: "wx" });
  await writeFile(resolve(directory, "release.json.sig"), JSON.stringify({ keyId: envelope.keyId, signature: envelope.signature }), { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${basename(directory)}: signed ${envelope.manifest.releaseId}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
