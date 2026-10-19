import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";

interface DirectoryTokenEntry {
  path: string;
  expiresAt: number;
}

export class DirectoryTokenVault {
  private readonly entries = new Map<string, DirectoryTokenEntry>();

  constructor(
    private readonly lifetimeMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {}

  issue(directoryPath: string): string {
    const normalizedPath = resolve(directoryPath);
    if (!statSync(normalizedPath).isDirectory()) throw new Error("NOT_A_DIRECTORY");
    this.pruneExpired();
    const token = randomUUID();
    this.entries.set(token, { path: normalizedPath, expiresAt: this.now() + this.lifetimeMs });
    return token;
  }

  resolve(token: string): string {
    const entry = this.entries.get(token);
    if (!entry || entry.expiresAt <= this.now()) {
      this.entries.delete(token);
      throw new Error("DIRECTORY_TOKEN_INVALID");
    }
    return entry.path;
  }

  clear(): void {
    this.entries.clear();
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(token);
    }
  }
}
