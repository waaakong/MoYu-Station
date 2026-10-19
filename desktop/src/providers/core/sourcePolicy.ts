import type { FallbackReason, ProviderId, ProviderTrackRef } from "@studyroom/contracts";

const SAFE_FALLBACK_REASONS = new Set<FallbackReason>([
  "timeout", "temporary-network", "rate-limited", "circuit-open", "address-refresh-failed"
]);

export class SourcePolicy {
  constructor(private preferredOrder: ProviderId[] = ["netease", "qq", "kugou"]) {}

  setPreferredOrder(order: ProviderId[]): void {
    if (order.length !== 3 || new Set(order).size !== 3) throw new Error("INVALID_PROVIDER_ORDER");
    this.preferredOrder = [...order];
  }

  order(): ProviderId[] { return [...this.preferredOrder]; }

  candidates(items: ProviderTrackRef[]): ProviderTrackRef[] {
    return [...items].sort((left, right) => {
      const available = Number(right.isAvailable) - Number(left.isAvailable);
      if (available) return available;
      return this.preferredOrder.indexOf(left.providerId) - this.preferredOrder.indexOf(right.providerId);
    });
  }

  canFallback(reason: FallbackReason, from: ProviderTrackRef, to: ProviderTrackRef): boolean {
    return SAFE_FALLBACK_REASONS.has(reason)
      && from.matchScore != null
      && from.matchScore >= 0.95
      && to.matchScore != null
      && to.matchScore >= 0.95
      && to.isAvailable
      && to.rights === "available";
  }
}
