import { describe, expect, it } from 'vitest';
import { entityId, sameEntityId } from '../src/entityId';
describe('decimal entity identity', () => {
  it('keeps adjacent 64-bit identities distinct and supports legacy safe integers', () => {
    expect(entityId('9223372036854775807')).toBe('9223372036854775807');
    expect(sameEntityId('2104509220480131074', '2104509220480131075')).toBe(false);
    expect(sameEntityId('42', 42)).toBe(true);
  });
  it('rejects precision loss, noncanonical, missing and out-of-range identities', () => {
    for (const id of [Number('2104509220480131074'), 0, -1, 1.5, NaN, Infinity, null, undefined, '', '01', '1e3', ' 1', '9223372036854775808']) {
      expect(() => entityId(id)).toThrow('ENTITY_ID_INVALID');
      expect(sameEntityId(id, id)).toBe(false);
    }
  });
});
