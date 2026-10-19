import { fullContentHash } from "./contentFingerprint";
import type { ScannedAudioFile } from "./scanner";
import type { LocalDatabaseStore, LocationCandidate } from "../../database/database";

const MAX_LIBRARY_TRACKS = 50_000;

export interface ImportSummary {
  imported: number;
  addedLocations: number;
  updated: number;
  failed: number;
  missing: number;
}

export interface ImportOptions {
  rootPath?: string;
  reconcile?: boolean;
}

export class LocalLibraryImporter {
  constructor(
    private readonly database: LocalDatabaseStore,
    private readonly hashFile: (path: string) => Promise<string> = fullContentHash
  ) {}

  async import(files: ScannedAudioFile[], options: ImportOptions = {}): Promise<ImportSummary> {
    const root = options.rootPath ? this.database.ensureLibraryRoot(options.rootPath) : undefined;
    let imported = 0;
    let addedLocations = 0;
    let updated = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const existing = this.database.findLocationByPath(file.path);
        const candidates = this.database.findFingerprintCandidates(file.quickSignature, file.size, file.path);
        const { matches: duplicateMatches, incomingHash } = await this.findContentMatches(file, existing, candidates);
        let targetTrackId = existing?.trackId;
        if (duplicateMatches.length) {
          const all = [existing, ...duplicateMatches].filter((candidate): candidate is LocationCandidate => Boolean(candidate));
          const canonical = all.sort((a, b) => a.createdAt - b.createdAt)[0]!;
          targetTrackId = canonical.trackId;
          for (const match of all) {
            if (match.trackId !== targetTrackId) this.database.mergeTracks(targetTrackId, match.trackId);
          }
        }
        if (!existing && !targetTrackId && this.database.trackCount() >= MAX_LIBRARY_TRACKS) {
          failed += 1;
          continue;
        }
        const result = this.database.upsertScannedLocation(file, root?.id, targetTrackId, incomingHash);
        if (result.status === "imported") imported += 1;
        else if (result.status === "added-location") addedLocations += 1;
        else updated += 1;
      } catch {
        failed += 1;
      }
    }

    const missing = root && options.reconcile
      ? this.database.reconcileRoot(root.id, files.map((file) => file.path))
      : 0;
    return { imported, addedLocations, updated, failed, missing };
  }

  private async findContentMatches(
    file: ScannedAudioFile,
    existing: LocationCandidate | undefined,
    candidates: LocationCandidate[]
  ): Promise<{ matches: LocationCandidate[]; incomingHash?: string }> {
    if (!candidates.length) {
      const unchangedHash = existing?.size === file.size && existing.modifiedAt === file.modifiedAt
        ? existing.contentHash
        : undefined;
      return { matches: [], incomingHash: unchangedHash };
    }
    const unchanged = existing?.size === file.size && existing.modifiedAt === file.modifiedAt;
    const incomingHash = unchanged && existing?.contentHash ? existing.contentHash : await this.hashFile(file.path);
    if (existing && !existing.contentHash) this.database.setLocationContentHash(existing.id, incomingHash);
    const matches: LocationCandidate[] = [];
    for (const candidate of candidates) {
      let candidateHash = candidate.contentHash;
      if (!candidateHash) {
        try {
          candidateHash = await this.hashFile(candidate.path);
          this.database.setLocationContentHash(candidate.id, candidateHash);
        } catch {
          continue;
        }
      }
      if (candidateHash === incomingHash) matches.push(candidate);
    }
    return { matches, incomingHash };
  }
}
