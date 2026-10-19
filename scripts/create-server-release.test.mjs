import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServerRelease, verifyServerRelease } from "./create-server-release.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const BUILT_AT = "2026-09-17T08:00:00.000Z";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studyroom-server-release-"));
  const web = join(root, "dist");
  await mkdir(join(web, "assets"), { recursive: true });
  await writeFile(join(web, "index.html"), "<main>StudyRoom</main>");
  await writeFile(join(web, "assets", "app.js"), "export default true;");
  const backend = join(root, "backend.jar");
  await writeFile(backend, "synthetic jar");
  return { root, web, backend, output: join(root, "output") };
}

test("creates and independently verifies an immutable server release", async () => {
  const data = await fixture();
  try {
    const result = await createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "phase12-test",
      gitSha: SHA,
      builtAt: BUILT_AT
    });
    assert.equal(result.manifest.artifacts.length, 3);
    assert.deepEqual(result.manifest.artifacts.map((item) => item.path), [
      "backend/study-room.jar",
      "web/assets/app.js",
      "web/index.html"
    ]);
    const verified = await verifyServerRelease(result.releaseDirectory);
    assert.equal(verified.gitSha, SHA);
    await assert.rejects(() => createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "phase12-test",
      gitSha: SHA,
      builtAt: BUILT_AT
    }), /SERVER_RELEASE_ALREADY_EXISTS/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("detects a modified artifact", async () => {
  const data = await fixture();
  try {
    const result = await createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "phase12-tamper",
      gitSha: SHA,
      builtAt: BUILT_AT
    });
    await writeFile(join(result.releaseDirectory, "web", "index.html"), "tampered");
    await assert.rejects(() => verifyServerRelease(result.releaseDirectory), /SERVER_RELEASE_HASH_MISMATCH/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects release identifiers that could escape the output root", async () => {
  const data = await fixture();
  try {
    await assert.rejects(() => createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "../escape",
      gitSha: SHA,
      builtAt: BUILT_AT
    }), /SERVER_RELEASE_ID_INVALID/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("rejects symbolic links in the web payload", async (context) => {
  const data = await fixture();
  try {
    try {
      await symlink(join(data.web, "index.html"), join(data.web, "linked.html"), "file");
    } catch (error) {
      if (error.code === "EPERM" || error.code === "EACCES") {
        context.skip("Symbolic link creation is unavailable on this Windows host");
        return;
      }
      throw error;
    }
    await assert.rejects(() => createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "phase12-link",
      gitSha: SHA,
      builtAt: BUILT_AT
    }), /SERVER_RELEASE_SYMLINK_FORBIDDEN/);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test("manifest contains no source paths or secret material", async () => {
  const data = await fixture();
  try {
    const result = await createServerRelease({
      backendPath: data.backend,
      webPath: data.web,
      outputRoot: data.output,
      releaseId: "phase12-redaction",
      gitSha: SHA,
      builtAt: BUILT_AT
    });
    const raw = await readFile(join(result.releaseDirectory, "release.json"), "utf8");
    assert.equal(raw.includes(data.root), false);
    assert.equal(/password|token|secret/i.test(raw), false);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});
