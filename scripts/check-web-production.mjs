import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".txt", ".yml", ".yaml"]);
const FORBIDDEN = [
  // Axios contains an inert `http://localhost` origin fallback for non-browser
  // runtimes. A port or path identifies an actionable development endpoint.
  { code: "WEB_DEV_LOCALHOST", pattern: /(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+|\/)/i },
  { code: "WEB_PRIVATE_KEY", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { code: "WEB_SERVER_SECRET", pattern: /(?:STUDYROOM_DB_PASSWORD|STUDYROOM_INVITATION_PEPPER|CLIENT_UPDATES_IMPORT_SECRET)\s*[=:]\s*[^,;}\s]+/i },
  { code: "WEB_DEBUG_SOURCE_MAP", pattern: /\/\/# sourceMappingURL=.*\.map\b/ }
];

async function walk(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`WEB_SYMLINK_FORBIDDEN:${relative(root, path)}`);
    if (info.isDirectory()) files.push(...await walk(root, path));
    else if (info.isFile()) files.push(path);
  }
  return files;
}

export async function checkWebProduction(directory) {
  const root = resolve(directory);
  const files = await walk(root);
  if (!files.some((path) => relative(root, path).split("\\").join("/") === "index.html")) {
    throw new Error("WEB_INDEX_MISSING");
  }
  if (files.some((path) => extname(path).toLowerCase() === ".map")) throw new Error("WEB_SOURCE_MAP_FORBIDDEN");
  let scanned = 0;
  for (const path of files) {
    if (!TEXT_EXTENSIONS.has(extname(path).toLowerCase())) continue;
    const info = await lstat(path);
    if (info.size > 16 * 1024 * 1024) throw new Error(`WEB_TEXT_FILE_TOO_LARGE:${relative(root, path)}`);
    const contents = await readFile(path, "utf8");
    for (const check of FORBIDDEN) {
      if (check.pattern.test(contents)) throw new Error(`${check.code}:${relative(root, path)}`);
    }
    scanned += 1;
  }
  return { files: files.length, scanned };
}

async function main() {
  const directory = process.argv[2] || "frontend/dist";
  const result = await checkWebProduction(directory);
  process.stdout.write(`Web production scan passed for ${result.files} files (${result.scanned} text files).\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) await main();
