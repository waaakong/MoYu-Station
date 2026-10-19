import { describe, expect, it } from "vitest";
import { updaterBuildConfig } from "../src/updater/updateBuildConfig";

describe("production updater build gate", () => {
  it("is closed in ordinary source and unpackaged builds", () => {
    const config = updaterBuildConfig("0.1.0", false);
    expect(config.controlEnabled).toBe(false);
    expect(config.installEnabled).toBe(false);
    expect(config.channel).toBe("stable");
  });
});
