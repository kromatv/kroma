import { describe, expect, it } from 'vitest';
import { sheetMovesRing } from './sheet-moves-ring';

describe('sheetMovesRing', () => {
  it('moves the ring itself whether or not a remote is configured', () => {
    expect(sheetMovesRing(true)).toBe(true);
    expect(sheetMovesRing(false)).toBe(true);
  });
});
