import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ProviderId } from "@studyroom/contracts";

export interface SecretEncryption {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

export interface ProviderSecretSession {
  version: 1;
  values: Record<string, string>;
  expiresAt?: number;
  accountScopeHash?: string;
}

interface VaultFileV2 {
  version: 2;
  providers: Partial<Record<ProviderId, string>>;
}

type VaultFileV1 = Partial<Record<ProviderId, string>>;

export class CredentialVault {
  constructor(
    private readonly vaultPath: string,
    private readonly encryption: SecretEncryption
  ) {}

  store(providerId: ProviderId, credential: string): void {
    this.storeSession(providerId, { version: 1, values: { legacy: credential } });
  }

  has(providerId: ProviderId): boolean {
    return Boolean(this.readVaultFile().providers[providerId]);
  }

  readForProvider(providerId: ProviderId): string | undefined {
    if (!this.encryption.isAvailable()) throw new Error("SECURE_STORAGE_UNAVAILABLE");
    return this.readSession(providerId)?.values.legacy;
  }

  storeSession(providerId: ProviderId, session: ProviderSecretSession): void {
    if (!this.encryption.isAvailable()) throw new Error("SECURE_STORAGE_UNAVAILABLE");
    const vault = this.readVaultFile();
    vault.providers[providerId] = this.encryption.encrypt(JSON.stringify(session)).toString("base64");
    this.writeVaultFile(vault);
  }

  readSession(providerId: ProviderId): ProviderSecretSession | undefined {
    if (!this.encryption.isAvailable()) throw new Error("SECURE_STORAGE_UNAVAILABLE");
    const encoded = this.readVaultFile().providers[providerId];
    if (!encoded) return undefined;
    try {
      const parsed = JSON.parse(this.encryption.decrypt(Buffer.from(encoded, "base64"))) as ProviderSecretSession;
      if (parsed?.version !== 1 || !parsed.values || typeof parsed.values !== "object") throw new Error();
      return parsed;
    } catch {
      throw new Error("CREDENTIAL_VAULT_CORRUPTED");
    }
  }

  clear(providerId: ProviderId): void {
    const vault = this.readVaultFile();
    delete vault.providers[providerId];
    this.writeVaultFile(vault);
  }

  private readVaultFile(): VaultFileV2 {
    if (!existsSync(this.vaultPath)) return { version: 2, providers: {} };
    try {
      const parsed = JSON.parse(readFileSync(this.vaultPath, "utf8")) as VaultFileV2 | VaultFileV1;
      if (!parsed || typeof parsed !== "object") throw new Error();
      if ("version" in parsed) {
        if (parsed.version !== 2 || !parsed.providers || typeof parsed.providers !== "object") throw new Error();
        return parsed;
      }
      return { version: 2, providers: parsed };
    } catch {
      throw new Error("CREDENTIAL_VAULT_CORRUPTED");
    }
  }

  private writeVaultFile(vault: VaultFileV2): void {
    mkdirSync(dirname(this.vaultPath), { recursive: true });
    const temporaryPath = `${this.vaultPath}.tmp`;
    writeFileSync(temporaryPath, JSON.stringify(vault), { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, this.vaultPath);
  }
}
