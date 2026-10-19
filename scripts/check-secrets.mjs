import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

const binaryExtensions = new Set([
  ".aif", ".aiff", ".avi", ".bmp", ".class", ".dll", ".exe", ".gif",
  ".ico", ".jar", ".jpeg", ".jpg", ".mov", ".mp3", ".mp4", ".ogg",
  ".pdf", ".png", ".so", ".wav", ".webm", ".webp", ".zip"
]);

const alwaysScan = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["credential-url", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i]
];

const assignmentPattern = /\b(password|passwd|secret|token|api[_-]?key|access[_-]?key)\b\s*[:=]\s*["']?([^\s"'#,}]+)/i;
const configExtensions = new Set([".env", ".ini", ".json", ".md", ".properties", ".toml", ".yaml", ".yml"]);
const allowedValue = /^(?:\$\{|\$\(|process\.env|system\.getenv|<|replace[-_]|change[-_]?me|example|placeholder|dummy|test|none|null|false|true|\*+$)/i;

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const findings = [];

for (const file of tracked) {
  const extension = extname(file).toLowerCase();
  if (binaryExtensions.has(extension)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [rule, pattern] of alwaysScan) {
      if (pattern.test(line)) findings.push({ file, line: index + 1, rule });
    }

    if (!configExtensions.has(extension) && !file.endsWith(".env.example")) continue;
    const match = line.match(assignmentPattern);
    if (!match) continue;
    const value = match[2].trim();
    if (value === "" || allowedValue.test(value)) continue;
    findings.push({ file, line: index + 1, rule: "literal-secret-assignment" });
  }
}

if (findings.length > 0) {
  console.error("Potential committed secrets detected (values are intentionally redacted):");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} [${finding.rule}]`);
  }
  process.exit(1);
}

console.log(`Secret scan passed for ${tracked.length} tracked files.`);
