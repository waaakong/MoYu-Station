import { lstatSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import type { AvailableLocalProfileSummary } from "@studyroom/contracts";
import type { LocalDatabaseStore } from "../database/database";

const MAX_CACHE_ENTRIES = 100_000;

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";
}

function fileBytes(path: string): number {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? stat.size : 0;
  } catch (error) {
    if (missing(error)) return 0;
    throw error;
  }
}

function directoryBytes(root: string): number {
  try {
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink()) throw new Error("LOCAL_PROFILE_STORAGE_UNSAFE");
    if (!rootStat.isDirectory()) return 0;
  } catch (error) {
    if (missing(error)) return 0;
    throw error;
  }
  const pending = [root];
  let total = 0;
  let entriesSeen = 0;
  while (pending.length > 0) {
    const directory = pending.pop();
    if (!directory) continue;
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (missing(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > MAX_CACHE_ENTRIES) throw new Error("LOCAL_PROFILE_STORAGE_SCAN_LIMIT");
      if (entry.isSymbolicLink()) continue;
      const target = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += fileBytes(target);
      if (!Number.isSafeInteger(total)) throw new Error("LOCAL_PROFILE_STORAGE_SCAN_LIMIT");
    }
  }
  return total;
}

export class LocalProfileService {
  constructor(
    private readonly database: LocalDatabaseStore,
    private readonly databasePath: string,
    private readonly mediaCacheDirectory: string
  ) {}

  read(): AvailableLocalProfileSummary {
    const counts = this.database.readLocalProfileCounts();
    const databaseBytes = ["", "-wal", "-shm", "-journal"]
      .reduce((total, suffix) => total + fileBytes(`${this.databasePath}${suffix}`), 0);
    const storageBytes = databaseBytes + directoryBytes(this.mediaCacheDirectory);
    if (!Number.isSafeInteger(storageBytes)) throw new Error("LOCAL_PROFILE_STORAGE_SCAN_LIMIT");
    return {
      status: "available",
      ...counts,
      storageBytes
    };
  }
}
