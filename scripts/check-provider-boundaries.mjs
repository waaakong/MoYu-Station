import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const textExtensions = new Set([
  ".cjs", ".css", ".html", ".java", ".js", ".json", ".jsx", ".mjs",
  ".scss", ".ts", ".tsx", ".vue", ".xml", ".yaml", ".yml"
]);
const productionRoots = ["desktop/src/", "frontend/src/", "backend/src/", "packages/"];
const rendererBoundaryRoots = ["packages/contracts/src/", "desktop/src/preload/", "frontend/src/"];
const credentialBoundaryRoots = [...rendererBoundaryRoots, "desktop/src/main/ipc/"];
const copiedReferenceBasenames = new Set([
  "kugou-api.js", "qq-vip-api.js", "qishui-api.js", "spotify-api.js"
]);
const providerHosts = /(?:music\.163\.com|y\.qq\.com|kugou\.com)/i;
const copyleftHeader = /GNU GENERAL PUBLIC LICENSE|GPL-3\.0-only|SPDX-License-Identifier:\s*(?:AGPL|GPL)-/i;
const privateFixtureKeys = /^(?:authorization|cookie|credential|password|access_?token|refresh_?token|session_?token|csrf_?token)$/i;

const legacyRules = [
  ["storeProviderSession", /\bstoreProviderSession\b/g],
  ["hasProviderSession", /\bhasProviderSession\b/g],
  ["clearProviderSession", /\bclearProviderSession\b/g],
  ["ProviderSessionInput", /\bProviderSessionInput\b/g],
  ["ProviderSessionStatus", /\bProviderSessionStatus\b/g],
  ["providerSessionSchema", /\bproviderSessionSchema\b/g],
  ["rawCredentialMember", /\bcredential\s*:|\.credential\b/g]
];

function isWithin(file, roots) {
  return roots.some((root) => file.startsWith(root));
}

function countMatches(content, pattern) {
  return [...content.matchAll(new RegExp(pattern.source, pattern.flags))].length;
}

function inspectFixtureValue(value, path, findings) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectFixtureValue(entry, `${path}[${index}]`, findings));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const entryPath = path ? `${path}.${key}` : key;
    if (privateFixtureKeys.test(key)) findings.push(`contains forbidden private field ${entryPath}`);
    inspectFixtureValue(entry, entryPath, findings);
  }
}

const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
  cwd: workspaceRoot,
  encoding: "utf8"
}).split("\0").filter(Boolean).map((file) => file.replaceAll("\\", "/"));

const findings = [];
let scanned = 0;

for (const file of files) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  let content;
  try {
    content = readFileSync(resolve(workspaceRoot, file), "utf8");
  } catch {
    continue;
  }
  scanned += 1;

  if (isWithin(file, productionRoots)) {
    const basename = file.split("/").at(-1)?.toLowerCase();
    if (file.toLowerCase().includes("/mineradio/") || copiedReferenceBasenames.has(basename)) {
      findings.push({ file, rule: "copied-reference-path" });
    }
    if (copyleftHeader.test(content)) findings.push({ file, rule: "copyleft-reference-code" });
  }

  if (isWithin(file, rendererBoundaryRoots) && providerHosts.test(content)) {
    findings.push({ file, rule: "provider-host-in-renderer-boundary" });
  }

  if (file.startsWith("desktop/src/providers/") && /\bconsole\.(?:debug|info|log|warn|error)\s*\(/.test(content)) {
    findings.push({ file, rule: "unredacted-provider-console" });
  }

  if (isWithin(file, credentialBoundaryRoots)) {
    for (const [id, pattern] of legacyRules) {
      const count = countMatches(content, pattern);
      if (!count) continue;
      findings.push({ file, rule: `renderer-credential-boundary:${id}`, count, allowed: 0 });
    }
  }

  if (file.startsWith("desktop/test/fixtures/providers/") && file.endsWith(".json")) {
    try {
      const parsed = JSON.parse(content);
      const fixtureFindings = [];
      inspectFixtureValue(parsed, "", fixtureFindings);
      for (const detail of fixtureFindings) findings.push({ file, rule: `private-provider-fixture:${detail}` });
    } catch {
      findings.push({ file, rule: "invalid-provider-fixture-json" });
    }
    for (const match of content.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      try {
        const hostname = new URL(match[0]).hostname.toLowerCase();
        if (hostname !== "invalid" && !hostname.endsWith(".invalid")) {
          findings.push({ file, rule: "real-url-in-provider-fixture" });
        }
      } catch {
        findings.push({ file, rule: "malformed-url-in-provider-fixture" });
      }
    }
  }
}

if (findings.length) {
  console.error("Provider boundary violations detected:");
  for (const finding of findings) {
    const count = finding.count ? ` count=${finding.count} allowed=${finding.allowed}` : "";
    console.error(`- ${finding.file} [${finding.rule}]${count}`);
  }
  process.exit(1);
}

console.log(`Provider boundary scan passed for ${scanned} text files.`);
