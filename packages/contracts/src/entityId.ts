/** Decimal database identity. Numbers are accepted only for legacy safe-integer responses. */
export type EntityId = string | number;
export function entityId(value: unknown): string {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('ENTITY_ID_INVALID');
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error('ENTITY_ID_INVALID');
  const id = String(value);
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) throw new Error('ENTITY_ID_INVALID');
  return id;
}
export function sameEntityId(left: unknown, right: unknown): boolean {
  try { return entityId(left) === entityId(right); } catch { return false; }
}
