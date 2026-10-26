import type { ProviderTrackBadge, ProviderTrackRef, Track } from '@studyroom/contracts';

export const badgeLabels: Record<ProviderTrackBadge, string> = {
  vip: 'VIP', purchase: '付费购买', 'no-source': '无音源', 'region-restricted': '地区限制'
};
const descriptions: Record<ProviderTrackBadge, string> = {
  vip: '平台标记为会员曲目，能否播放以当前账号授权为准',
  purchase: '平台标记为需购买曲目，能否播放以当前账号授权为准',
  'no-source': '当前平台标记该曲目下架或无可用音源，不代表其他平台也不可用',
  'region-restricted': '当前平台对该曲目存在地区播放限制'
};

export function selectedTrackCandidate(track: Track): ProviderTrackRef | undefined {
  const source = track.source;
  if (source.kind !== 'provider') return undefined;
  return track.providerCandidates?.find(c => c.providerId === source.providerId && c.trackId === source.trackId);
}

export function candidateBadges(candidate?: ProviderTrackRef): ProviderTrackBadge[] {
  if (!candidate) return [];
  const badges = new Set(candidate.badges ?? []);
  // Old generic subscription-required values did not reliably distinguish VIP.
  // Only explicit region errors/rights are safe to recover from older queues.
  if (candidate.rights === 'region-restricted' || candidate.unavailableReason === 'PROVIDER_REGION_RESTRICTED') badges.add('region-restricted');
  if (candidate.isAvailable && candidate.rights === 'available') badges.delete('no-source');
  return [...badges];
}

export function badgeDescription(badge: ProviderTrackBadge): string { return descriptions[badge]; }
export function canVerifyCandidateRights(candidate:ProviderTrackRef):boolean {
  return candidate.providerId==='kugou'&&!candidate.trackId.startsWith('file:')&&!candidate.badges?.includes('no-source');
}
export function providerAvailabilityText(candidate: ProviderTrackRef): string {
  const labels = candidateBadges(candidate).map(b => badgeLabels[b]);
  const status = candidate.isAvailable && candidate.rights === 'available'
    ? '可尝试播放，实际权限由平台复核' : canVerifyCandidateRights(candidate)?'点击后核对当前酷狗账号的播放权限':'当前不可播放；未确认的具体原因请以播放提示为准';
  return [...labels, status].join(' · ');
}
export function trackPlayLabel(track: Track): string {
  const labels = candidateBadges(selectedTrackCandidate(track)).map(b => badgeLabels[b]);
  return [`播放 ${track.title}`, ...labels].join(' · ');
}
