import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const RELEASE_ID = /^[a-z0-9][a-z0-9._-]{0,95}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) throw new Error("SERVER_RELEASE_ARGUMENT_INVALID");
    if (key === "--allow-dirty") {
      result.allowDirty = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("SERVER_RELEASE_ARGUMENT_INVALID");
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

function normalizedRelative(root, target) {
  const value = relative(root, target).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../") || value.startsWith("/")) {
    throw new Error("SERVER_RELEASE_PATH_ESCAPE");
  }
  return value;
}

async function hashFile(path) {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
}

async function assertRegularFile(path) {
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isFile()) throw new Error("SERVER_RELEASE_SOURCE_INVALID");
  return info;
}

async function copyTree(sourceRoot, destinationRoot, releaseRoot, entries) {
  const sourceInfo = await lstat(sourceRoot);
  if (sourceInfo.isSymbolicLink() || !sourceInfo.isDirectory()) {
    throw new Error("SERVER_RELEASE_SOURCE_INVALID");
  }
  await mkdir(destinationRoot, { recursive: true });
  const names = (await readdir(sourceRoot)).sort((left, right) => left.localeCompare(right));
  for (const name of names) {
    if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
      throw new Error("SERVER_RELEASE_FILENAME_INVALID");
    }
    const source = join(sourceRoot, name);
    const destination = join(destinationRoot, name);
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error("SERVER_RELEASE_SYMLINK_FORBIDDEN");
    if (info.isDirectory()) {
      await copyTree(source, destination, releaseRoot, entries);
    } else if (info.isFile()) {
      await copyFile(source, destination, 0);
      entries.push(await artifactEntry(releaseRoot, destination));
    } else {
      throw new Error("SERVER_RELEASE_SOURCE_INVALID");
    }
  }
}

async function artifactEntry(releaseRoot, path) {
  const info = await assertRegularFile(path);
  return {
    path: normalizedRelative(releaseRoot, path),
    size: info.size,
    sha256: await hashFile(path)
  };
}

function validateInput(input) {
  if (!RELEASE_ID.test(input.releaseId || "")) throw new Error("SERVER_RELEASE_ID_INVALID");
  if (!GIT_SHA.test(input.gitSha || "")) throw new Error("SERVER_RELEASE_GIT_SHA_INVALID");
  const builtAt = Date.parse(input.builtAt || "");
  if (!Number.isFinite(builtAt) || new Date(builtAt).toISOString() !== input.builtAt) {
    throw new Error("SERVER_RELEASE_BUILT_AT_INVALID");
  }
}

export async function createServerRelease(input) {
  validateInput(input);
  const backendSource = resolve(input.backendPath);
  const webSource = resolve(input.webPath);
  await assertRegularFile(backendSource);
  const webInfo = await lstat(webSource);
  if (webInfo.isSymbolicLink() || !webInfo.isDirectory()) throw new Error("SERVER_RELEASE_SOURCE_INVALID");

  const outputRoot = resolve(input.outputRoot);
  const releaseDirectory = resolve(outputRoot, input.releaseId);
  if (dirname(releaseDirectory) !== outputRoot) throw new Error("SERVER_RELEASE_PATH_ESCAPE");
  const temporaryDirectory = resolve(outputRoot, `.${input.releaseId}.tmp-${process.pid}`);
  if (dirname(temporaryDirectory) !== outputRoot) throw new Error("SERVER_RELEASE_PATH_ESCAPE");

  await mkdir(outputRoot, { recursive: true });
  try {
    await lstat(releaseDirectory);
    throw new Error("SERVER_RELEASE_ALREADY_EXISTS");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rm(temporaryDirectory, { recursive: true, force: true });

  try {
    const backendDirectory = join(temporaryDirectory, "backend");
    await mkdir(backendDirectory, { recursive: true });
    const backendTarget = join(backendDirectory, "study-room.jar");
    await copyFile(backendSource, backendTarget, 0);
    const artifacts = [await artifactEntry(temporaryDirectory, backendTarget)];
    await copyTree(webSource, join(temporaryDirectory, "web"), temporaryDirectory, artifacts);
    artifacts.sort((left, right) => left.path.localeCompare(right.path));
    const manifest = {
      schemaVersion: 1,
      releaseId: input.releaseId,
      gitSha: input.gitSha,
      builtAt: input.builtAt,
      totalSize: artifacts.reduce((sum, item) => sum + item.size, 0),
      artifacts
    };
    await writeFile(join(temporaryDirectory, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await rename(temporaryDirectory, releaseDirectory);
    return { manifest, releaseDirectory };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyServerRelease(directory) {
  const releaseDirectory = resolve(directory);
  const manifestPath = join(releaseDirectory, "release.json");
  const manifestInfo = await assertRegularFile(manifestPath);
  if (manifestInfo.size > 4 * 1024 * 1024) throw new Error("SERVER_RELEASE_MANIFEST_TOO_LARGE");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateInput(manifest);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error("SERVER_RELEASE_MANIFEST_INVALID");
  }
  let totalSize = 0;
  const seen = new Set();
  for (const item of manifest.artifacts) {
    if (!item || typeof item.path !== "string" || !Number.isSafeInteger(item.size) || item.size < 0 ||
        !/^[0-9a-f]{64}$/.test(item.sha256 || "") || seen.has(item.path)) {
      throw new Error("SERVER_RELEASE_MANIFEST_INVALID");
    }
    seen.add(item.path);
    const target = resolve(releaseDirectory, ...item.path.split("/"));
    if (normalizedRelative(releaseDirectory, target) !== item.path) throw new Error("SERVER_RELEASE_PATH_ESCAPE");
    const info = await assertRegularFile(target);
    if (info.size !== item.size || await hashFile(target) !== item.sha256) {
      throw new Error("SERVER_RELEASE_HASH_MISMATCH");
    }
    totalSize += info.size;
  }
  if (totalSize !== manifest.totalSize) throw new Error("SERVER_RELEASE_SIZE_MISMATCH");
  return manifest;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.verify) {
    const manifest = await verifyServerRelease(args.verify);
    process.stdout.write(`${basename(resolve(args.verify))}: verified ${manifest.artifacts.length} artifacts\n`);
    return;
  }
  if (!args.backend || !args.web || !args.output || !args["release-id"]) {
    throw new Error("Usage: --backend <jar> --web <dist> --output <root> --release-id <id> [--git-sha <sha>] [--built-at <ISO>] [--allow-dirty]");
  }
  if (!args.allowDirty && git(["status", "--porcelain"])) throw new Error("SERVER_RELEASE_WORKTREE_DIRTY");
  const result = await createServerRelease({
    backendPath: args.backend,
    webPath: args.web,
    outputRoot: args.output,
    releaseId: args["release-id"],
    gitSha: args["git-sha"] || git(["rev-parse", "HEAD"]),
    builtAt: args["built-at"] || new Date().toISOString()
  });
  process.stdout.write(`${basename(result.releaseDirectory)}: created ${result.manifest.artifacts.length} artifacts (${result.manifest.totalSize} bytes)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
