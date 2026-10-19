import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { listFilesRecursively, sha256Buffer, validateGeneratedInventory } from "./scene-asset-pipeline.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const generatedDirectory = resolve(scriptDirectory, "../src/assets/scenes/generated");
const manifest = JSON.parse(await readFile(join(generatedDirectory, "manifest.generated.json"), "utf8"));
const expectedPaths = new Set(manifest.entries.map((entry) => entry.relativePath));
const actualFiles = (await listFilesRecursively(generatedDirectory))
  .filter((path) => [".webp", ".jpg"].includes(extname(path).toLowerCase()));

if (actualFiles.length !== expectedPaths.size) throw new Error(`Expected ${expectedPaths.size} scene images, found ${actualFiles.length}`);
for (const entry of manifest.entries) {
  const path = join(generatedDirectory, ...entry.relativePath.split("/"));
  const buffer = await readFile(path);
  const metadata = await sharp(buffer).metadata();
  if (buffer.length !== entry.bytes) throw new Error(`${entry.relativePath} byte size does not match manifest`);
  if (sha256Buffer(buffer) !== entry.sha256) throw new Error(`${entry.relativePath} SHA-256 does not match manifest`);
  if (metadata.width !== entry.width || metadata.height !== entry.height) throw new Error(`${entry.relativePath} dimensions do not match manifest`);
}

const summary = validateGeneratedInventory(manifest.entries);
console.log(`Scene assets verified: ${manifest.entries.length} files, WebP ${summary.webpBytes} / 14000000 bytes, all ${summary.totalBytes} / 32000000 bytes`);
