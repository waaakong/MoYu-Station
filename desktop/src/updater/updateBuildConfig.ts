import type { UpdateChannel } from "@studyroom/contracts";
import { parsePublicKeys } from "./updateSecurity";
import type { UpdateManagerConfig } from "./updateManager";

declare const __STUDYROOM_UPDATE_CONTROL_ENABLED__: boolean;
declare const __STUDYROOM_UPDATE_INSTALL_ENABLED__: boolean;
declare const __STUDYROOM_UPDATE_CHANNEL__: UpdateChannel;
declare const __STUDYROOM_UPDATE_API_BASE_URL__: string;
declare const __STUDYROOM_UPDATE_ORIGIN__: string;
declare const __STUDYROOM_UPDATE_PUBLIC_KEYS_JSON__: string;

export function updaterBuildChannel(): UpdateChannel {
  return typeof __STUDYROOM_UPDATE_CHANNEL__ === "undefined" ? "stable" : __STUDYROOM_UPDATE_CHANNEL__;
}

export function updaterBuildConfig(currentVersion: string, packaged: boolean): UpdateManagerConfig {
  const controlEnabled = typeof __STUDYROOM_UPDATE_CONTROL_ENABLED__ !== "undefined" && __STUDYROOM_UPDATE_CONTROL_ENABLED__ === true;
  const requestedInstall = typeof __STUDYROOM_UPDATE_INSTALL_ENABLED__ !== "undefined" && __STUDYROOM_UPDATE_INSTALL_ENABLED__ === true;
  return {
    controlEnabled,
    installEnabled: controlEnabled && requestedInstall && packaged && process.platform === "win32",
    channel: updaterBuildChannel(),
    apiBaseUrl: typeof __STUDYROOM_UPDATE_API_BASE_URL__ === "undefined" ? "https://moyustation.xyz/api" : __STUDYROOM_UPDATE_API_BASE_URL__,
    updateOrigin: typeof __STUDYROOM_UPDATE_ORIGIN__ === "undefined" ? "https://moyustation.xyz" : __STUDYROOM_UPDATE_ORIGIN__,
    currentVersion,
    publicKeys: parsePublicKeys(typeof __STUDYROOM_UPDATE_PUBLIC_KEYS_JSON__ === "undefined" ? "" : __STUDYROOM_UPDATE_PUBLIC_KEYS_JSON__)
  };
}
