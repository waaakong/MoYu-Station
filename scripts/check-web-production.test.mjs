import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkWebProduction } from "./check-web-production.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "studyroom-web-scan-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<script src='/assets/app.js'></script>");
  await writeFile(join(root, "assets", "app.js"), "fetch('/api/auth/me')");
  return root;
}

test("accepts a same-origin production build", async () => {
  const root = await fixture();
  try {
    const result = await checkWebProduction(root);
    assert.equal(result.files, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects a development origin", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "assets", "app.js"), "fetch('http://localhost:8080/api')");
    await assert.rejects(() => checkWebProduction(root), /WEB_DEV_LOCALHOST/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects source maps and embedded server secrets", async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, "assets", "app.js.map"), "{}");
    await assert.rejects(() => checkWebProduction(root), /WEB_SOURCE_MAP_FORBIDDEN/);
    await rm(join(root, "assets", "app.js.map"));
    await writeFile(join(root, "assets", "app.js"), "STUDYROOM_DB_PASSWORD=leaked");
    await assert.rejects(() => checkWebProduction(root), /WEB_SERVER_SECRET/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
