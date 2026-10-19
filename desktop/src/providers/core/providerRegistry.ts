import type { ProviderId } from "@studyroom/contracts";
import type { ProviderAdapter, ProviderAdapterFactory } from "./providerAdapter";

export class ProviderRegistry {
  private readonly factories = new Map<ProviderId, ProviderAdapterFactory>();
  private readonly instances = new Map<ProviderId, ProviderAdapter>();

  register(providerId: ProviderId, factory: ProviderAdapterFactory): void {
    this.factories.set(providerId, factory);
  }

  has(providerId: ProviderId): boolean { return this.factories.has(providerId); }

  get(providerId: ProviderId): ProviderAdapter | undefined {
    const existing = this.instances.get(providerId);
    if (existing) return existing;
    const factory = this.factories.get(providerId);
    if (!factory) return undefined;
    const adapter = factory();
    if (adapter.providerId !== providerId) throw new Error("PROVIDER_REGISTRY_MISMATCH");
    this.instances.set(providerId, adapter);
    return adapter;
  }

  async dispose(providerId?: ProviderId): Promise<void> {
    const targets = providerId
      ? [[providerId, this.instances.get(providerId)] as const]
      : [...this.instances.entries()];
    for (const [id, adapter] of targets) {
      if (!adapter) continue;
      await adapter.dispose();
      this.instances.delete(id);
    }
  }
}
