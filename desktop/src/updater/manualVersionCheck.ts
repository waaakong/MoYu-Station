export interface PublicDownloadRelease {
  version: string;
  size: number;
  sha256: string;
  filename: string;
}

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const filenamePattern = /^(?:StudyRoom-stable-[0-9A-Za-z.-]+-x64|MoYu-Setup-[0-9A-Za-z.-]+-win-x64)\.exe$/;

function parseVersion(value: string): { core: bigint[]; prerelease?: string[] } {
  const match = versionPattern.exec(value);
  if (!match) throw new Error("UPDATE_VERSION_INVALID");
  return {
    core: [BigInt(match[1]!), BigInt(match[2]!), BigInt(match[3]!)],
    prerelease: match[4]?.split(".")
  };
}

/** SemVer ordering for the numeric core and prerelease identifiers used by desktop releases. */
export function compareReleaseVersions(left: string, right: string): number {
  const a = parseVersion(left), b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index]! !== b.core[index]!) return a.core[index]! > b.core[index]! ? 1 : -1;
  }
  if (!a.prerelease && !b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  const count = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < count; index += 1) {
    const x = a.prerelease[index], y = b.prerelease[index];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    const xNumeric = /^\d+$/.test(x), yNumeric = /^\d+$/.test(y);
    if (xNumeric && yNumeric) {
      const xn = BigInt(x), yn = BigInt(y);
      if (xn !== yn) return xn > yn ? 1 : -1;
    } else if (xNumeric !== yNumeric) return xNumeric ? -1 : 1;
    else return x > y ? 1 : -1;
  }
  return 0;
}

export function parsePublicDownloadRelease(value: unknown): PublicDownloadRelease {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("UPDATE_RELEASE_INVALID");
  const release = value as Record<string, unknown>;
  if (typeof release.version !== "string" || typeof release.filename !== "string" ||
      !Number.isSafeInteger(release.size) || (release.size as number) <= 0 ||
      typeof release.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256) ||
      !filenamePattern.test(release.filename)) throw new Error("UPDATE_RELEASE_INVALID");
  parseVersion(release.version);
  return { version: release.version, filename: release.filename, size: release.size as number, sha256: release.sha256 };
}

