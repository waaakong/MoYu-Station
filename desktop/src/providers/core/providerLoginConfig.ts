import type { ProviderId } from "@studyroom/contracts";

export interface ProviderLoginConfig {
  providerId: ProviderId;
  startUrl: string;
  allowedHostnameSuffixes: readonly string[];
}

const CONFIGS: Record<ProviderId, ProviderLoginConfig> = {
  netease: {
    providerId: "netease",
    startUrl: "https://music.163.com/",
    allowedHostnameSuffixes: ["music.163.com", "163.com"]
  },
  qq: {
    providerId: "qq",
    startUrl: "https://y.qq.com/",
    allowedHostnameSuffixes: ["y.qq.com", "qq.com"]
  },
  kugou: {
    providerId: "kugou",
    startUrl: "https://www.kugou.com/",
    allowedHostnameSuffixes: ["kugou.com"]
  }
};

export function providerLoginConfig(providerId: ProviderId): ProviderLoginConfig {
  return CONFIGS[providerId];
}

export function isAllowedProviderLoginUrl(config: ProviderLoginConfig, input: string): boolean {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
    const hostname = url.hostname.toLowerCase();
    return config.allowedHostnameSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

export const PROVIDER_LOGIN_WINDOW_OPTIONS = Object.freeze({
  width: 520,
  height: 720,
  show: false,
  webPreferences: Object.freeze({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    preload: undefined
  })
});
