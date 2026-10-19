import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { build } from "esbuild";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(desktopRoot, "..");
const testRoot = resolve(desktopRoot, "dist-tests");
const electronBinary = resolve(
  workspaceRoot,
  "node_modules/electron/dist",
  process.platform === "win32" ? "electron.exe" : "electron"
);

await rm(testRoot, { recursive: true, force: true });
await mkdir(testRoot, { recursive: true });

await build({
  entryPoints: [
    resolve(desktopRoot, "test-electron/database.test.ts"),
    resolve(desktopRoot, "test-electron/mediaProtocol.test.ts")
  ],
  outdir: testRoot,
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  external: ["node:*", "electron"]
});

const child = spawn(electronBinary, [
  "--test",
  resolve(testRoot, "database.test.cjs"),
  resolve(testRoot, "mediaProtocol.test.cjs")
], {
  cwd: workspaceRoot,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  stdio: "inherit"
});

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code ?? 1));
});

process.exitCode = Number(exitCode);
