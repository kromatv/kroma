import { describe, expect, it } from 'vitest';
import { sheetMovesRing } from './sheet-moves-ring';

describe('sheetMovesRing (native)', () => {
  it('leaves the ring to a configured remote', () => {
    expect(sheetMovesRing(true)).toBe(false);
  });

  it('moves the ring itself without a remote', () => {
    expect(sheetMovesRing(false)).toBe(true);
  });
});
