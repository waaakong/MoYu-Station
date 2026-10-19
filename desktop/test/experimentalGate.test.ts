import { describe, expect, it } from "vitest";
import { isExperimentalProviderBuild, providerCapabilityEnvironmentFlags, providerEnvironmentFlags } from "../src/providers/core/experimentalGate";

describe("experimental provider build gate", () => {
  it("requires the main-process master flag before individual providers", () => {
    expect(providerEnvironmentFlags({ STUDYROOM_PROVIDER_NETEASE: "1" })).toEqual({});
    expect(providerEnvironmentFlags({
      STUDYROOM_PROVIDERS: "1",
      STUDYROOM_PROVIDER_NETEASE: "true",
      STUDYROOM_PROVIDER_QQ_MUSIC: "0",
      STUDYROOM_PROVIDER_KUGOU: "yes"
    })).toEqual({ netease: true, qq: false, kugou: true });
  });

  it("is disabled in the normal test build", () => {
    expect(isExperimentalProviderBuild()).toBe(false);
  });

  it("keeps every Provider capability behind its own Main-process flag", () => {
    const flags = providerCapabilityEnvironmentFlags({
      STUDYROOM_PROVIDER_NETEASE_SEARCH: "1",
      STUDYROOM_PROVIDER_NETEASE_PLAYBACK: "0",
      STUDYROOM_PROVIDER_QQ_MUSIC_LYRICS: "true"
    });
    expect(flags.netease?.search).toBe(true);
    expect(flags.netease?.playback).toBe(false);
    expect(flags.qq?.lyrics).toBe(true);
    expect(flags.kugou?.search).toBe(false);
  });
});
