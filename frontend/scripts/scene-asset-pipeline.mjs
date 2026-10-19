import { createHash, randomUUID } from "node:crypto";
import { access, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import {
  FORMAT_LIMITS,
  FORMATS,
  SCENE_KEYS,
  SOURCE_DIMENSIONS,
  TIME_KEYS,
  TOTAL_LIMITS,
  VARIANT_SPECS,
  expectedHeight
} from "./scene-asset-config.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function assertSafeAssetPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/.test(value) || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)) {
    throw new Error(`Unsafe asset path: ${String(value)}`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe asset path: ${value}`);
  }
  return value;
}

function expectedMasterKeys() {
  return new Set(SCENE_KEYS.flatMap((sceneKey) => TIME_KEYS.map((timeKey) => `${sceneKey}/${timeKey}`)));
}

function expectedVariantKeys() {
  return new Set(SCENE_KEYS.flatMap((sceneKey) => TIME_KEYS.flatMap((timeKey) => VARIANT_SPECS.flatMap((variant) => FORMATS.map((format) => `${sceneKey}/${timeKey}/${variant.key}/${format}`)))));
}

export function validateMasterInventory(inventory) {
  const expected = expectedMasterKeys();
  const seen = new Set();
  for (const entry of inventory) {
    if (!SCENE_KEYS.includes(entry.sceneKey) || !TIME_KEYS.includes(entry.timeKey)) {
      throw new Error(`Unexpected scene master: ${entry.sceneKey}/${entry.timeKey}`);
    }
    const key = `${entry.sceneKey}/${entry.timeKey}`;
    if (seen.has(key)) throw new Error(`Duplicate scene master: ${key}`);
    seen.add(key);
    if (String(entry.extension).toLowerCase() !== ".png") throw new Error(`Scene master must be PNG: ${key}`);
    if (entry.width !== SOURCE_DIMENSIONS.width || entry.height !== SOURCE_DIMENSIONS.height) {
      throw new Error(`Scene master must be 1672x941: ${key}`);
    }
    if (entry.channels !== SOURCE_DIMENSIONS.channels) throw new Error(`Scene master must be RGB without alpha: ${key}`);
    assertSafeAssetPath(entry.relativePath);
    if (!SHA256_PATTERN.test(entry.sha256)) throw new Error(`Invalid master SHA-256: ${key}`);
  }
  const missing = [...expected].filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`Missing scene master: ${missing.join(", ")}`);
  return [...inventory].sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function validateGeneratedInventory(inventory) {
  const expected = expectedVariantKeys();
  const seen = new Set();
  let webpBytes = 0;
  let totalBytes = 0;
  for (const entry of inventory) {
    const key = `${entry.sceneKey}/${entry.timeKey}/${entry.sizeKey}/${entry.format}`;
    if (!expected.has(key)) throw new Error(`Unexpected generated scene asset: ${key}`);
    if (seen.has(key)) throw new Error(`Duplicate generated scene asset: ${key}`);
    seen.add(key);
    const variant = VARIANT_SPECS.find((candidate) => candidate.key === entry.sizeKey);
    if (!variant || entry.width !== variant.width || entry.height !== expectedHeight(variant.width)) {
      throw new Error(`Invalid generated dimensions: ${key}`);
    }
    assertSafeAssetPath(entry.relativePath);
    if (!SHA256_PATTERN.test(entry.sha256)) throw new Error(`Invalid generated SHA-256: ${key}`);
    const hardLimit = FORMAT_LIMITS[entry.format][entry.sizeKey];
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0 || entry.bytes > hardLimit) {
      throw new Error(`${key} exceeds ${hardLimit} bytes`);
    }
    if (entry.format === "webp") webpBytes += entry.bytes;
    totalBytes += entry.bytes;
  }
  const missing = [...expected].filter((key) => !seen.has(key));
  if (missing.length) throw new Error(`Missing generated scene asset: ${missing.join(", ")}`);
  if (webpBytes > TOTAL_LIMITS.webp) throw new Error(`WebP scene assets exceed ${TOTAL_LIMITS.webp} bytes`);
  if (totalBytes > TOTAL_LIMITS.all) throw new Error(`All scene assets exceed ${TOTAL_LIMITS.all} bytes`);
  return { entries: [...inventory], webpBytes, totalBytes };
}

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function publishDirectoryAtomically({ stagingDirectory, targetDirectory, validate }) {
  const stage = resolve(stagingDirectory);
  const target = resolve(targetDirectory);
  if (stage === target || dirname(stage) !== dirname(target)) throw new Error("Staging and target directories must be distinct siblings");
  await validate(stage);
  const backup = `${target}.backup-${randomUUID()}`;
  const hadTarget = await pathExists(target);
  if (hadTarget) await rename(target, backup);
  try {
    await rename(stage, target);
    if (hadTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (await pathExists(target)) await rm(target, { recursive: true, force: true });
    if (hadTarget && await pathExists(backup)) await rename(backup, target);
    throw error;
  }
}

export async function listFilesRecursively(root) {
  const result = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) result.push(path);
    }
  }
  await visit(root);
  return result.sort();
}

export function toPortableRelativePath(root, path) {
  const value = relative(root, path).split(sep).join("/");
  return assertSafeAssetPath(value);
}

export async function fileSummary(root, path) {
  const info = await stat(path);
  return {
    name: basename(path),
    extension: extname(path).toLowerCase(),
    relativePath: toPortableRelativePath(root, path),
    bytes: info.size
  };
}
