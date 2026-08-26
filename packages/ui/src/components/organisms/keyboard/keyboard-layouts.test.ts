import { describe, expect, it } from 'vitest';
import { DELETE_KEY, KEYBOARD_LAYOUTS, LAYOUT_LETTER_ROWS, URL_ROWS } from './keyboard-layouts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').sort().join('');

describe('LAYOUT_LETTER_ROWS', () => {
  it('covers every layout preference', () => {
    for (const l of KEYBOARD_LAYOUTS) {
      expect(LAYOUT_LETTER_ROWS[l]).toBeDefined();
    }
  });

  it('contains each of the 26 letters exactly once per layout', () => {
    for (const l of KEYBOARD_LAYOUTS) {
      const letters = LAYOUT_LETTER_ROWS[l].flat();
      expect(letters).toHaveLength(26);
      expect([...letters].sort().join('')).toBe(ALPHABET);
    }
  });
});

describe('URL_ROWS', () => {
  it('always yields a digits row plus three rows of ten', () => {
    for (const l of KEYBOARD_LAYOUTS) {
      const rows = URL_ROWS[l];
      expect(rows).toHaveLength(4);
      for (const row of rows) expect(row).toHaveLength(10);
    }
  });

  it('keeps the historical ABC url grid (lowercase letters then specials)', () => {
    expect(URL_ROWS.abc).toEqual([
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
      ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'],
      ['u', 'v', 'w', 'x', 'y', 'z', '-', ':', '/', DELETE_KEY],
    ]);
  });

  it('orders AZERTY letters in typewriter rows', () => {
    expect(URL_ROWS.azerty[1]).toEqual(['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']);
  });
});
