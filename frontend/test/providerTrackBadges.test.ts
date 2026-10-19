import { describe, it, expect } from 'vitest';
import type { ProviderTrackRef, Track } from '@studyroom/contracts';
import { candidateBadges, selectedTrackCandidate, trackPlayLabel, providerAvailabilityText } from '../src/audio/providerTrackBadges';
const ref = (patch: Partial<ProviderTrackRef> = {}): ProviderTrackRef => ({ id:'netease:1',providerId:'netease',trackId:'1',title:'Song',artists:['Artist'],quality:'unknown',versionTags:[],rights:'available',isAvailable:true,...patch });
const track = (candidates: ProviderTrackRef[]): Track => ({id:'1',title:'Song',artist:'Artist',source:{kind:'provider',providerId:'netease',trackId:'1'},providerCandidates:candidates});
describe('provider badge display', () => {
  it('keeps VIP classification on a playable member song', () => {
    expect(candidateBadges(ref({badges:['vip']}))).toEqual(['vip']);
    expect(trackPlayLabel(track([ref({badges:['vip']})]))).toBe('播放 Song · VIP');
  });
  it.each(['PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMITED','PROVIDER_SESSION_EXPIRED'] as const)('does not infer no source from %s', unavailableReason => {
    expect(candidateBadges(ref({rights:'unavailable',isAvailable:false,unavailableReason}))).toEqual([]);
  });
  it('accepts explicit no source but rejects contradictory available metadata', () => {
    expect(candidateBadges(ref({rights:'unavailable',isAvailable:false,badges:['no-source']}))).toEqual(['no-source']);
    expect(candidateBadges(ref({badges:['no-source']}))).toEqual([]);
  });
  it('uses exact active provider and track, never a different aggregate candidate', () => {
    const wrong=ref({trackId:'2',badges:['vip']}), correct=ref({badges:['purchase']});
    expect(selectedTrackCandidate(track([wrong,correct]))).toBe(correct);
    expect(selectedTrackCandidate(track([wrong]))).toBeUndefined();
    const value=track([correct,ref({providerId:'qq',badges:['vip']})]);
    value.source={kind:'provider',providerId:'qq',trackId:'1'};
    expect(trackPlayLabel(value)).toBe('播放 Song · VIP');
    value.source={kind:'local',fileToken:'local'};
    expect(trackPlayLabel(value)).toBe('播放 Song');
  });
  it('keeps old ambiguous subscription and missing catalog metadata unlabelled', () => {
    expect(candidateBadges(ref({rights:'subscription-required',isAvailable:false}))).toEqual([]);
    expect(providerAvailabilityText(ref({rights:'unavailable',isAvailable:false}))).toContain('未确认');
  });
  it('shows explicit regional restriction separately and deduplicates', () => {
    expect(candidateBadges(ref({rights:'region-restricted',isAvailable:false,badges:['region-restricted']}))).toEqual(['region-restricted']);
  });
});
