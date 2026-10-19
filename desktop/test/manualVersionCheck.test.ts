import { describe, expect, it } from "vitest";
import { compareReleaseVersions, parsePublicDownloadRelease } from "../src/updater/manualVersionCheck";

describe("manual update version metadata", () => {
  it("compares numeric and prerelease identifiers in SemVer order", () => {
    expect(compareReleaseVersions("0.2.0-trial.20261015.1", "0.2.0-trial.20261010.2")).toBeGreaterThan(0);
    expect(compareReleaseVersions("1.0.0", "1.0.0-rc.2")).toBeGreaterThan(0);
    expect(compareReleaseVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareReleaseVersions("1.0.0+build.2", "1.0.0+build.3")).toBe(0);
  });

  it("accepts only complete download metadata and a fixed installer filename shape", () => {
    expect(parsePublicDownloadRelease({
      version: "0.2.0-trial.20261015.1", size: 1024, sha256: "a".repeat(64),
      filename: "MoYu-Setup-0.2.0-trial.20261015.1-win-x64.exe"
    }).version).toBe("0.2.0-trial.20261015.1");
    expect(() => parsePublicDownloadRelease({
      version: "latest", size: 1024, sha256: "a".repeat(64), filename: "../../evil.exe"
    })).toThrow("UPDATE_RELEASE_INVALID");
  });
});
