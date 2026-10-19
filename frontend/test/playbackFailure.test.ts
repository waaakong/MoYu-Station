import { describe, expect, it } from 'vitest';
import { normalizePlaybackError, playbackFailure } from '../src/audio/state/playbackFailure';

describe('safe playback reasons', () => {
  it('preserves stable Electron error names without displaying upstream messages', () => {
    const error = new Error('private token=https://secret.invalid'); error.name = 'PROVIDER_SESSION_EXPIRED';
    expect(normalizePlaybackError(error)).toBe('PROVIDER_SESSION_EXPIRED');
    expect(playbackFailure(normalizePlaybackError(error)).action).toBe('login');
    expect(JSON.stringify(playbackFailure(error))).not.toContain('secret');
  });
  it.each(['PROVIDER_RATE_LIMITED','PROVIDER_CIRCUIT_OPEN'])('%s offers waiting, not an immediate request', code => {
    expect(playbackFailure(code).action).toBe('wait');
  });
  it.each(['PROVIDER_RIGHTS_RESTRICTED','PROVIDER_REGION_RESTRICTED','PROVIDER_API_CHANGED','PROVIDER_DISABLED'])('%s is not advertised as fixed by retry', code => {
    expect(playbackFailure(code).action).toBe('none');
  });
  it('does not equate MediaError 4 with a proven format or rights problem', () => {
    expect(playbackFailure('MEDIA_SOURCE_UNSUPPORTED').reason).toContain('尚不能确认');
    expect(playbackFailure(new Error('unknown sensitive body')).reason).toContain('尚不能确认');
    expect(playbackFailure('PROVIDER_NOT_A_REAL_CODE').code).toBe('SOURCE_NOT_PLAYABLE');
  });
});
