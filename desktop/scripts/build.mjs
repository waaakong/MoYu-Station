import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import signingModule from './update-signing-config.cjs';
import {buildNative} from './build-native.mjs';

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(desktopRoot, "dist");
const experimentalProviders = ["1", "true", "yes", "on"].includes(String(process.env.STUDYROOM_EXPERIMENTAL_PROVIDERS || "").toLowerCase());
const updateChannels = new Set(["stable", "beta", "provider-experimental"]);
const updateChannel = updateChannels.has(process.env.STUDYROOM_UPDATE_CHANNEL) ? process.env.STUDYROOM_UPDATE_CHANNEL : "stable";
const updateSettings = signingModule.updateSigningConfig();
const updateControlEnabled = updateSettings.controlEnabled;
const updateInstallEnabled = updateSettings.installEnabled;
const updateApiBaseUrl = updateSettings.apiBaseUrl;
const updateOrigin = updateSettings.updateOrigin;
const updatePublicKeysJson = updateSettings.publicKeysJson;
const cloudOriginUrl = new URL(process.env.STUDYROOM_CLOUD_ORIGIN || "https://moyustation.xyz");
if (
  cloudOriginUrl.protocol !== "https:"
  || cloudOriginUrl.username
  || cloudOriginUrl.password
  || cloudOriginUrl.pathname !== "/"
  || cloudOriginUrl.search
  || cloudOriginUrl.hash
) {
  throw new Error("STUDYROOM_CLOUD_ORIGIN_INVALID");
}
const cloudOrigin = cloudOriginUrl.origin;
const desktopOriginUrl = new URL(process.env.STUDYROOM_DESKTOP_ORIGIN || "https://desktop.moyustation.xyz");
if (
  desktopOriginUrl.protocol !== "https:"
  || desktopOriginUrl.username
  || desktopOriginUrl.password
  || desktopOriginUrl.pathname !== "/"
  || desktopOriginUrl.search
  || desktopOriginUrl.hash
) {
  throw new Error("STUDYROOM_DESKTOP_ORIGIN_INVALID");
}
const desktopOrigin = desktopOriginUrl.origin;

await rm(distRoot, { recursive: true, force: true });
await mkdir(resolve(distRoot, "main"), { recursive: true });
await mkdir(resolve(distRoot, "preload"), { recursive: true });
await mkdir(resolve(distRoot, "renderer"), { recursive: true });
await mkdir(resolve(distRoot, "providers"), { recursive: true });
buildNative(desktopRoot);
await cp(resolve(desktopRoot, "resources/brand"), resolve(distRoot, "brand"), { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node24",
  sourcemap: true,
  // Keep upstream license comments alongside each generated bundle in the packaged dist tree.
  legalComments: "external",
  external: ["electron", "electron-updater", "node:*"],
  define: {
    __STUDYROOM_PROVIDER_DEFAULTS__: JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([key]) => key === 'STUDYROOM_PROVIDERS' || /^STUDYROOM_PROVIDER_(NETEASE|QQ_MUSIC|KUGOU)(_|$)/.test(key)))),
    __STUDYROOM_EXPERIMENTAL_PROVIDERS__: JSON.stringify(experimentalProviders),
    __STUDYROOM_UPDATE_CONTROL_ENABLED__: JSON.stringify(updateControlEnabled),
    __STUDYROOM_UPDATE_INSTALL_ENABLED__: JSON.stringify(updateInstallEnabled),
    __STUDYROOM_UPDATE_TRUST_MODE__: JSON.stringify(updateSettings.mode),
    __STUDYROOM_UPDATE_CHANNEL__: JSON.stringify(updateChannel),
    __STUDYROOM_UPDATE_API_BASE_URL__: JSON.stringify(updateApiBaseUrl),
    __STUDYROOM_UPDATE_ORIGIN__: JSON.stringify(updateOrigin),
    __STUDYROOM_UPDATE_PUBLIC_KEYS_JSON__: JSON.stringify(updatePublicKeysJson),
    __STUDYROOM_CLOUD_ORIGIN__: JSON.stringify(cloudOrigin),
    __STUDYROOM_DESKTOP_ORIGIN__: JSON.stringify(desktopOrigin)
  }
};

await build({
  ...common,
  entryPoints: [resolve(desktopRoot, "src/main/index.ts")],
  outfile: resolve(distRoot, "main/index.cjs"),
  format: "cjs"
});

await build({
  ...common,
  entryPoints: [resolve(desktopRoot, "src/providers/worker.ts")],
  outfile: resolve(distRoot, "providers/worker.cjs"),
  format: "cjs"
});
await build({...common,entryPoints:[resolve(desktopRoot,'src/audio/library/metadata-worker.mjs')],outfile:resolve(distRoot,'main/metadata-worker.cjs'),format:'cjs'});

await build({
  ...common,
  entryPoints: [resolve(desktopRoot, "src/preload/index.ts")],
  outfile: resolve(distRoot, "preload/index.cjs"),
  format: "cjs"
});

await cp(
  resolve(desktopRoot, "src/renderer/recovery.html"),
  resolve(distRoot, "renderer/recovery.html")
);

console.log("Electron main, preload, provider worker, and recovery assets built.");
await build({...common,entryPoints:[resolve(desktopRoot,'src/preload/lyrics.ts')],outfile:resolve(distRoot,'preload/lyrics.cjs'),format:'cjs'});
for(const name of ['lyrics.html','lyrics.css','lyrics.js'])await cp(resolve(desktopRoot,'src/renderer',name),resolve(distRoot,'renderer',name));
await build({...common,entryPoints:[resolve(desktopRoot,'src/preload/wheel.ts')],outfile:resolve(distRoot,'preload/wheel.cjs'),format:'cjs'});
for(const name of ['wheel.html','wheel.css','wheel.js'])await cp(resolve(desktopRoot,'src/renderer',name),resolve(distRoot,'renderer',name));
