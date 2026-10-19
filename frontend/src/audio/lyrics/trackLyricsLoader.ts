import type { StudyRoomDesktopBridge, Track, TrackLyrics } from '@studyroom/contracts';
type LyricsBridge = Pick<StudyRoomDesktopBridge, 'getTrackLyrics' | 'getProviderLyrics'>;

/** Queue IDs can be aggregate IDs; use the exact currently selected source. */
export async function readTrackLyrics(track: Track, bridge: LyricsBridge): Promise<TrackLyrics | undefined> {
  if (track.source.kind === 'provider') {
    const {providerId, trackId} = track.source;
    const result = await bridge.getProviderLyrics({providerId, trackId});
    if (result && (result.providerId !== providerId || result.trackId !== `${providerId}:${trackId}` || result.source !== 'provider')) {
      throw new Error('PROVIDER_LYRICS_IDENTITY_MISMATCH');
    }
    return result ? {...result, trackId: track.id} : undefined;
  }
  if (track.source.kind !== 'local') return undefined;
  const result = await bridge.getTrackLyrics({trackId:track.id});
  if (result && result.trackId !== track.id) throw new Error('LOCAL_LYRICS_IDENTITY_MISMATCH');
  return result;
}
