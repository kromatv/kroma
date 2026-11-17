import { describe, expect, it } from 'vitest';
import { counted } from './counted';

describe('counted', () => {
  it('puts the noun in the plural for any count but one', () => {
    expect([counted(0, 'change'), counted(1, 'change'), counted(3, 'change')]).toEqual([
      '0 changes',
      '1 change',
      '3 changes',
    ]);
  });
});
