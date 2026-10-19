import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const scriptRoot = join(root, "deploy", "scripts");

async function filesUnder(directory, suffix) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(path, suffix));
    else if (entry.name.endsWith(suffix)) result.push(path);
  }
  return result.sort();
}

test("every phase 12 shell entry point is strict and does not embed credentials", async () => {
  const paths = (await filesUnder(scriptRoot, ".sh")).filter((path) => !path.includes(`${join("scripts", "lib")}`));
  assert.ok(paths.length >= 8);
  for (const path of paths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /^#!\/usr\/bin\/env bash\n/);
    assert.match(source, /set -Eeuo pipefail/);
    assert.match(source, /umask 0(?:27|77)/);
    assert.doesNotMatch(source, /(?:--password(?:=|\s)|MYSQL_PWD=|curl\s+[^\n]*\s-k(?:\s|$)|eval\s|chmod\s+777)/);
    assert.doesNotMatch(source, /rm\s+-rf\s+(?:\/|"?\$\{?(?:HOME|CODEX_HOME))/);
  }
});

test("all state-changing entry points require explicit confirmation", async () => {
  for (const name of ["backup-before-v2.sh", "install-v2-release.sh", "switch-studyroom-upstream.sh", "rollback-studyroom-upstream.sh"]) {
    const source = await readFile(join(scriptRoot, name), "utf8");
    assert.match(source, /phase12_require_confirmation/);
    assert.match(source, /preview/);
  }
  const rollback = await readFile(join(scriptRoot, "rollback-studyroom-upstream.sh"), "utf8");
  assert.match(rollback, /never restores the database/i);
  assert.doesNotMatch(rollback, /mysql|mysqldump/i);

  const backup = await readFile(join(scriptRoot, "backup-before-v2.sh"), "utf8");
  assert.match(backup, /safe\.directory=/);
  assert.match(backup, /rev-parse --verify HEAD/);
});

test("deployment templates preserve the constrained resource and network boundaries", async () => {
  const service = await readFile(join(root, "deploy", "systemd", "studyroom-v2.service"), "utf8");
  assert.match(service, /-Xms256m -Xmx384m/);
  assert.match(service, /MemoryMax=448M/);
  assert.match(service, /NoNewPrivileges=true/);
  assert.match(service, /ProtectSystem=strict/);

  const redis = await readFile(join(root, "deploy", "redis", "studyroom-v2.conf"), "utf8");
  assert.match(redis, /bind 127\.0\.0\.1 ::1/);
  assert.match(redis, /port 6380/);
  assert.match(redis, /maxmemory 64mb/);
  assert.match(redis, /notify-keyspace-events Ex/);
  assert.match(redis, /rename-command CONFIG ""/);

  const verifier = await readFile(join(root, "deploy", "scripts", "verify-v2-candidate.sh"), "utf8");
  assert.match(verifier, /::ffff:127\\\.0\\\.0\\\.1/);

  const resourceWatch = await readFile(join(root, "deploy", "scripts", "phase12-resource-watch.sh"), "utf8");
  assert.match(resourceWatch, /swapInPages/);
  assert.match(resourceWatch, /swapOutPages/);

  const rollback = await readFile(join(root, "deploy", "scripts", "rollback-studyroom-upstream.sh"), "utf8");
  assert.match(rollback, /systemctl enable --now study-room\.service/);
  assert.match(rollback, /systemctl disable --now studyroom-v2\.service/);

  const candidate = await readFile(join(root, "deploy", "nginx", "studyroom-v2-candidate.conf"), "utf8");
  assert.match(candidate, /listen 127\.0\.0\.1:8280/);

  const ipHttps = await readFile(join(root, "deploy", "nginx", "study-room-ip-https.conf"), "utf8");
  assert.match(ipHttps, /include \/etc\/nginx\/studyroom\/upstream\.conf/);
  assert.match(ipHttps, /root \/srv\/studyroom-active-web/);
  assert.match(ipHttps, /include \/etc\/nginx\/studyroom\/maintenance\.conf/);
  assert.doesNotMatch(ipHttps, /proxy_pass http:\/\/127\.0\.0\.1:8080/);
  assert.doesNotMatch(candidate, /listen\s+(?:0\.0\.0\.0|\[::\]):8280/);
  const production = await readFile(join(root, "deploy", "nginx", "studyroom-v2.conf"), "utf8");
  assert.match(production, /TLSv1\.2 TLSv1\.3/);
  assert.match(production, /location = \/api\/system\/health\/ready \{ return 404; \}/);
  assert.match(production, /return 301 https:\/\/moyustation\.xyz\$request_uri/);

  const preflight = await readFile(join(root, "deploy", "scripts", "phase12-preflight.sh"), "utf8");
  assert.match(preflight, /PUBLIC_ENTRY_MODE/);
  assert.match(preflight, /public_ip_https/);
  assert.match(preflight, /::ffff:127/);
  assert.match(preflight, /findmnt -n -T/);
  assert.doesNotMatch(preflight, /curl\s+[^\n]*\s-k(?:\s|$)/);
});
