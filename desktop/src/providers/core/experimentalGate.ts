import { PROVIDER_IDS, type ProviderCapability, type ProviderId } from "@studyroom/contracts";

declare const __STUDYROOM_EXPERIMENTAL_PROVIDERS__: boolean;
declare const __STUDYROOM_PROVIDER_DEFAULTS__: Record<string, string>;

function runtimeFlags(): NodeJS.ProcessEnv {
  return { ...(typeof __STUDYROOM_PROVIDER_DEFAULTS__ === 'undefined' ? {} : __STUDYROOM_PROVIDER_DEFAULTS__), ...process.env };
}

function enabled(value: string | undefined): boolean {
  return value != null && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isExperimentalProviderBuild(): boolean {
  return typeof __STUDYROOM_EXPERIMENTAL_PROVIDERS__ !== "undefined" && __STUDYROOM_EXPERIMENTAL_PROVIDERS__ === true;
}

export function providerEnvironmentFlags(environment: NodeJS.ProcessEnv = runtimeFlags()): Partial<Record<ProviderId, boolean>> {
  if (!enabled(environment.STUDYROOM_PROVIDERS)) return {};
  return {
    netease: enabled(environment.STUDYROOM_PROVIDER_NETEASE),
    qq: enabled(environment.STUDYROOM_PROVIDER_QQ_MUSIC),
    kugou: enabled(environment.STUDYROOM_PROVIDER_KUGOU)
  };
}

const CAPABILITIES: readonly ProviderCapability[] = ["search", "recommendations", "playlists", "favorites", "lyrics", "playback"];
const PROVIDER_ENV_NAMES: Record<ProviderId, string> = { netease: "NETEASE", qq: "QQ_MUSIC", kugou: "KUGOU" };

export function providerCapabilityEnvironmentFlags(environment: NodeJS.ProcessEnv = runtimeFlags()): Partial<Record<ProviderId, Partial<Record<ProviderCapability, boolean>>>> {
  return Object.fromEntries(PROVIDER_IDS.map((providerId) => [
    providerId,
    Object.fromEntries(CAPABILITIES.map((capability) => [
      capability,
      enabled(environment[`STUDYROOM_PROVIDER_${PROVIDER_ENV_NAMES[providerId]}_${capability.toUpperCase()}`])
    ]))
  ]));
}
