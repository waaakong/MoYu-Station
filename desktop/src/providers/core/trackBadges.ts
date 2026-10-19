import type { ProviderTrackBadge } from '@studyroom/contracts';

// Deliberately narrow mappings: missing/unknown fields are not proof of absence.
export function neteaseTrackBadges(fee?: number, status?: number): ProviderTrackBadge[] {
  const badges: ProviderTrackBadge[] = [];
  if (fee === 1) badges.push('vip');
  if (fee === 4) badges.push('purchase');
  if (status === -200) badges.push('no-source');
  return badges;
}

export function qqTrackBadges(pay: { pay_play?: number; pay_month?: number }): ProviderTrackBadge[] {
  // pay_play alone indicates payment, not whether a subscription or purchase applies.
  return pay.pay_play === 1 && pay.pay_month === 1 ? ['vip'] : [];
}

export function kugouTrackBadges(published?: number): ProviderTrackBadge[] {
  // Numeric privilege/pay-type flags are not interchangeable with membership.
  return published === 0 ? ['no-source'] : [];
}
