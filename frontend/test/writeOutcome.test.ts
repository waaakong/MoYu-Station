import { describe, expect, it } from 'vitest';
import { isUnknownWriteOutcome } from '../src/services/writeOutcome';

describe('write outcome classification', () => {
  it('treats lost browser and desktop replies as unknown, not rejected writes', () => {
    for (const error of [new Error('network'), { code: 'CLOUD_REQUEST_FAILED' }, { status: 503, code: 'AUTH_UNAVAILABLE' }]) {
      expect(isUnknownWriteOutcome(error)).toBe(true);
    }
  });
  it('does not turn explicit validation, permission, or rate-limit rejection into an unknown write', () => {
    for (const error of [{ status: 400, code: 'INVALID_PASSWORD' }, { status: 403, code: 'FORBIDDEN' }, { status: 429, code: 'AUTH_RATE_LIMITED' }]) {
      expect(isUnknownWriteOutcome(error)).toBe(false);
    }
  });
});
