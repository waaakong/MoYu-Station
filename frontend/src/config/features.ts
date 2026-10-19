export type FeatureFlag =
  | "desktopShell"
  | "soundCenter"
  | "localLibrary"
  | "providers"
  | "publicRadio"
  | "providerNetease"
  | "providerQQMusic"
  | "providerKugou"
  | "webRadioRelay"
  | "entertainment"
  | "v2Pages"
  | "mediaAssets";

export type FeatureFlags = Record<FeatureFlag, boolean>;

const envKeys: Record<FeatureFlag, string> = {
  desktopShell: "VITE_FEATURE_DESKTOP_SHELL",
  soundCenter: "VITE_FEATURE_SOUND_CENTER",
  localLibrary: "VITE_FEATURE_LOCAL_LIBRARY",
  providers: "VITE_FEATURE_PROVIDERS",
  publicRadio: "VITE_FEATURE_PUBLIC_RADIO",
  providerNetease: "VITE_FEATURE_PROVIDER_NETEASE",
  providerQQMusic: "VITE_FEATURE_PROVIDER_QQ_MUSIC",
  providerKugou: "VITE_FEATURE_PROVIDER_KUGOU",
  webRadioRelay: "VITE_FEATURE_WEB_RADIO_RELAY",
  entertainment: "VITE_FEATURE_ENTERTAINMENT",
  v2Pages: "VITE_FEATURE_V2_PAGES",
  mediaAssets: "VITE_FEATURE_MEDIA_ASSETS"
};

function isEnabled(value: unknown): boolean {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function resolveFeatureFlags(env: Record<string, unknown> = {}): FeatureFlags {
  const requested = Object.fromEntries(
    Object.entries(envKeys).map(([flag, key]) => [flag, isEnabled(env[key])])
  ) as FeatureFlags;
  if (env.MODE === 'desktop-candidate') return {...requested,desktopShell:true,soundCenter:true,localLibrary:true,entertainment:true,v2Pages:true,mediaAssets:true};
  if (env.MODE !== "web-production") return requested;
  return {
    desktopShell: false,
    soundCenter: true,
    localLibrary: false,
    providers: false,
    publicRadio: true,
    providerNetease: false,
    providerQQMusic: false,
    providerKugou: false,
    webRadioRelay: false,
    entertainment: true,
    v2Pages: true,
    mediaAssets: requested.mediaAssets
  };
}

export const featureFlags = Object.freeze(resolveFeatureFlags(import.meta.env));
