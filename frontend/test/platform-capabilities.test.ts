import { describe, expect, it } from "vitest";
import type { StudyRoomDesktopBridge } from "@studyroom/contracts";
import { resolveFeatureFlags } from "../src/config/features";
import { resolveCapabilities } from "../src/platform/capabilities";

describe("runtime capability boundaries", () => {
  it('has an explicit desktop candidate preset without enabling providers or server features',()=>{
    const flags=resolveFeatureFlags({MODE:'desktop-candidate'});
    expect(flags.desktopShell && flags.soundCenter && flags.localLibrary && flags.entertainment && flags.v2Pages && flags.mediaAssets).toBe(true);
    expect(flags.providers || flags.providerNetease || flags.providerQQMusic || flags.providerKugou || flags.webRadioRelay).toBe(false);
  });
  it("does not expose Electron features in a browser", () => {
    const capabilities = resolveCapabilities();
    expect(capabilities.platform).toBe("web");
    expect(capabilities.localLibrary).toBe(false);
    expect(capabilities.autoUpdate).toBe(false);
    expect(capabilities.temporaryFilePlayback).toBe(true);
    expect(capabilities.publicRadio).toBe(true);
    expect(capabilities.providerLogin).toBe(false);
  });

  it("locks the web production capability preset", () => {
    expect(resolveFeatureFlags({
      MODE: "web-production",
      VITE_FEATURE_PROVIDERS: "true",
      VITE_FEATURE_LOCAL_LIBRARY: "true",
      VITE_FEATURE_WEB_RADIO_RELAY: "true"
    })).toEqual({
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
      mediaAssets: false
    });
  });

  it("detects the typed preload bridge", () => {
    const bridge = {} as StudyRoomDesktopBridge;
    expect(resolveCapabilities(bridge).platform).toBe("electron");
  });

  it("keeps unfinished features closed by default", () => {
    expect(resolveFeatureFlags()).toEqual({
      desktopShell: false,
      soundCenter: false,
      localLibrary: false,
      providers: false,
      publicRadio: false,
      providerNetease: false,
      providerQQMusic: false,
      providerKugou: false,
      webRadioRelay: false,
      entertainment: false,
      v2Pages: false,
      mediaAssets: false
    });
    expect(resolveFeatureFlags({ VITE_FEATURE_V2_PAGES: "true" }).v2Pages).toBe(true);
    expect(resolveFeatureFlags({ VITE_FEATURE_MEDIA_ASSETS: "true" }).mediaAssets).toBe(true);
    const providerFlags = resolveFeatureFlags({
      VITE_FEATURE_PROVIDERS: "true",
      VITE_FEATURE_PUBLIC_RADIO: "true",
      VITE_FEATURE_PROVIDER_KUGOU: "true"
    });
    expect(providerFlags.providers).toBe(true);
    expect(providerFlags.publicRadio).toBe(true);
    expect(providerFlags.providerKugou).toBe(true);
    expect(providerFlags.providerNetease).toBe(false);
    expect(providerFlags.providerQQMusic).toBe(false);
    expect(providerFlags.webRadioRelay).toBe(false);
  });
});
