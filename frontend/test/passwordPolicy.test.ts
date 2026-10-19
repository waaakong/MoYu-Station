import { describe, expect, it } from 'vitest';
import { newPasswordError } from '../src/services/passwordPolicy';
describe('password transport and Unicode policy',()=>{
  it('accepts 63 code points / 66 UTF-16 units at exactly 72 bytes',()=>expect(newPasswordError('a'.repeat(60)+'😀'.repeat(3))).toBe(''));
  it('rejects byte overflow and insufficient Unicode characters',()=>{
    for(const value of ['界'.repeat(25),'😀'.repeat(7),'a'.repeat(65),' '.repeat(8)]) expect(newPasswordError(value)).not.toBe('');
  });
});
