import { describe, expect, it } from "vitest";
import { isAllowedProviderLoginUrl, providerLoginConfig, PROVIDER_LOGIN_WINDOW_OPTIONS } from "../src/providers/core/providerLoginConfig";

describe("provider login isolation", () => {
  it("allows only each provider HTTPS domains", () => {
    const netease = providerLoginConfig("netease");
    expect(isAllowedProviderLoginUrl(netease, "https://music.163.com/")).toBe(true);
    expect(isAllowedProviderLoginUrl(netease, "https://sso.163.com/login")).toBe(true);
    expect(isAllowedProviderLoginUrl(netease, "http://music.163.com/")).toBe(false);
    expect(isAllowedProviderLoginUrl(netease, "https://music.163.com:8443/")).toBe(false);
    const credentialUrl = new URL('https://music.163.com/');
    credentialUrl.username = 'test-user'; credentialUrl.password = 'test-only';
    expect(isAllowedProviderLoginUrl(netease, credentialUrl.href)).toBe(false);
    expect(isAllowedProviderLoginUrl(netease, "https://music.163.com.attacker.invalid/")).toBe(false);
    expect(isAllowedProviderLoginUrl(netease, "file:///C:/Windows/System32/calc.exe")).toBe(false);
  });

  it("uses a sandboxed window without preload", () => {
    expect(PROVIDER_LOGIN_WINDOW_OPTIONS.webPreferences).toMatchObject({
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: undefined
    });
  });
});
