import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSafeAssetPath,
  publishDirectoryAtomically,
  validateGeneratedInventory,
  validateMasterInventory
} from "../scripts/scene-asset-pipeline.mjs";
import { SCENE_KEYS, TIME_KEYS, VARIANT_SPECS } from "../scripts/scene-asset-config.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

function masterInventory() {
  return SCENE_KEYS.flatMap((sceneKey) => TIME_KEYS.map((timeKey) => ({
    sceneKey,
    timeKey,
    extension: ".png",
    width: 1672,
    height: 941,
    channels: 3,
    relativePath: `${sceneKey}/${timeKey}.png`,
    bytes: 100,
    sha256: "a".repeat(64)
  })));
}

function generatedInventory() {
  return SCENE_KEYS.flatMap((sceneKey) => TIME_KEYS.flatMap((timeKey) => VARIANT_SPECS.flatMap((variant) => [
    {
      sceneKey,
      timeKey,
      sizeKey: variant.key,
      format: "webp",
      width: variant.width,
      height: Math.round(941 * variant.width / 1672),
      relativePath: `${sceneKey}/${timeKey}-${variant.width}.webp`,
      bytes: variant.key === "large" ? 200_000 : variant.key === "standard" ? 110_000 : 20_000,
      sha256: "b".repeat(64)
    },
    {
      sceneKey,
      timeKey,
      sizeKey: variant.key,
      format: "jpg",
      width: variant.width,
      height: Math.round(941 * variant.width / 1672),
      relativePath: `${sceneKey}/${timeKey}-${variant.width}.jpg`,
      bytes: variant.key === "large" ? 240_000 : variant.key === "standard" ? 150_000 : 22_000,
      sha256: "c".repeat(64)
    }
  ])));
}

describe("scene master validation", () => {
  it("accepts exactly six scenes and seven RGB PNG time points", () => {
    expect(validateMasterInventory(masterInventory())).toHaveLength(42);
  });

  it("rejects missing, duplicate, extra, lossy, transparent and resized masters", () => {
    expect(() => validateMasterInventory(masterInventory().slice(1))).toThrow(/missing/i);
    expect(() => validateMasterInventory([...masterInventory(), masterInventory()[0]])).toThrow(/duplicate/i);
    expect(() => validateMasterInventory([...masterInventory(), { ...masterInventory()[0], sceneKey: "custom" }])).toThrow(/unexpected/i);
    expect(() => validateMasterInventory(masterInventory().map((entry, index) => index ? entry : { ...entry, extension: ".jpg" }))).toThrow(/PNG/i);
    expect(() => validateMasterInventory(masterInventory().map((entry, index) => index ? entry : { ...entry, channels: 4 }))).toThrow(/RGB/i);
    expect(() => validateMasterInventory(masterInventory().map((entry, index) => index ? entry : { ...entry, width: 1960 }))).toThrow(/1672x941/i);
  });
});

describe("scene generated asset validation", () => {
  it("accepts a complete hashed three-size dual-format inventory", () => {
    const result = validateGeneratedInventory(generatedInventory());
    expect(result.entries).toHaveLength(252);
    expect(result.webpBytes).toBeLessThanOrEqual(14_000_000);
    expect(result.totalBytes).toBeLessThanOrEqual(32_000_000);
  });

  it("rejects unsafe paths, bad hashes and budget overages", () => {
    for (const path of ["../secret.webp", "/absolute.webp", "C:\\secret.webp", "https://example.com/a.webp"]) {
      expect(() => assertSafeAssetPath(path)).toThrow(/unsafe/i);
    }
    const badHash = generatedInventory();
    badHash[0] = { ...badHash[0], sha256: "bad" };
    expect(() => validateGeneratedInventory(badHash)).toThrow(/SHA-256/i);
    const oversized = generatedInventory();
    oversized[0] = { ...oversized[0], bytes: 351_000 };
    expect(() => validateGeneratedInventory(oversized)).toThrow(/350000/i);
  });
});

describe("atomic scene publishing", () => {
  it("replaces a verified directory and restores the old directory when verification fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "studyroom-scenes-"));
    temporaryDirectories.push(root);
    const target = join(root, "generated");
    const firstStage = join(root, "first-stage");
    await mkdir(target);
    await writeFile(join(target, "marker.txt"), "old");
    await mkdir(firstStage);
    await writeFile(join(firstStage, "marker.txt"), "new");

    await publishDirectoryAtomically({ stagingDirectory: firstStage, targetDirectory: target, validate: async () => undefined });
    expect(await readFile(join(target, "marker.txt"), "utf8")).toBe("new");

    const failingStage = join(root, "failing-stage");
    await mkdir(failingStage);
    await writeFile(join(failingStage, "marker.txt"), "broken");
    await expect(publishDirectoryAtomically({
      stagingDirectory: failingStage,
      targetDirectory: target,
      validate: async () => { throw new Error("invalid output"); }
    })).rejects.toThrow("invalid output");
    expect(await readFile(join(target, "marker.txt"), "utf8")).toBe("new");
  });
});
