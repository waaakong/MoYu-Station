import { createHash, randomBytes } from "node:crypto";
import type { ProviderId } from "@studyroom/contracts";
import type { LocalDatabaseStore, MetadataCacheRecord } from "../../database/database";

const SALT_KEY = "provider-cache-salt-v1";

export class MetadataCacheRepository {
  private readonly salt: string;

  constructor(private readonly database: LocalDatabaseStore) {
    const existing = database.getSetting<string>(SALT_KEY);
    this.salt = existing ?? randomBytes(32).toString("hex");
    if (!existing) database.setSetting(SALT_KEY, this.salt);
  }

  accountScope(accountId?: string): string {
    return createHash("sha256").update(this.salt).update("\0").update(accountId ?? "public").digest("hex");
  }

  put(providerId: ProviderId, accountScopeHash: string, key: string, value: unknown, ttlMs: number, now = Date.now()): void {
    this.database.writeProviderMetadataCache(providerId, accountScopeHash, key, value, now + ttlMs);
  }

  get<T>(providerId: ProviderId, accountScopeHash: string, key: string, now = Date.now()): MetadataCacheRecord<T> | undefined {
    return this.database.readProviderMetadataCache<T>(providerId, accountScopeHash, key, now);
  }

  clear(providerId: ProviderId, accountScopeHash?: string): void {
    this.database.clearProviderMetadataCache(providerId, accountScopeHash);
  }
}
