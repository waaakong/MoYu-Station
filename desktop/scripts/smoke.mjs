import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(desktopRoot, "..");
const packaged = process.argv.includes("--packaged");
const desktopPackage = JSON.parse(await readFile(resolve(desktopRoot, "package.json"), "utf8"));
const executableName = desktopPackage.build?.productName || desktopPackage.name;
const channel = ["stable", "beta", "provider-experimental"].includes(process.env.STUDYROOM_UPDATE_CHANNEL)
  ? process.env.STUDYROOM_UPDATE_CHANNEL
  : "stable";
const channelProductNames = {
  stable: executableName,
  beta: "墨屿自习室 Beta",
  "provider-experimental": "墨屿自习室 Provider Experimental"
};
const packagedRoot = resolve(desktopRoot, "release", channel, "win-unpacked");
const electronBinary = packaged ? resolve(
  packagedRoot,
  process.platform === "win32" ? `${channelProductNames[channel]}.exe` : channelProductNames[channel]
) : resolve(
  workspaceRoot,
  "node_modules/electron/dist",
  process.platform === "win32" ? "electron.exe" : "electron"
);
const electronArguments = packaged
  ? ["--smoke-test"]
  : [".", "--smoke-test"];
const userData = await mkdtemp(join(tmpdir(), "studyroom-electron-smoke-"));
const startedAt = Date.now();

let stdout = "";
let stderr = "";
try {
  const child = spawn(electronBinary, [...electronArguments, `--user-data-dir=${userData}`], {
    cwd: packaged ? dirname(electronBinary) : desktopRoot,
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const exitCode = await new Promise((resolveExit, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Electron smoke test timed out"));
    }, 30_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveExit(code ?? 1);
    });
  });

  if (exitCode !== 0 || !stdout.includes("STUDYROOM_ELECTRON_SMOKE_OK") || !stdout.includes("STUDYROOM_ELECTRON_ROUTE_OK scene focus")) {
    throw new Error(`Electron smoke test failed (exit ${exitCode})\n${stderr}`);
  }
  console.log(`Electron window smoke test passed in ${Date.now() - startedAt}ms.`);
} finally {
  await rm(userData, { recursive: true, force: true });
}
