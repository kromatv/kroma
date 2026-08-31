import { describe, expect, it } from 'vitest';
import { byCodeUnit } from './sort';

describe('the machine-independent string ordering', () => {
  it('orders a pair the way their code units run', () => {
    expect(byCodeUnit('a', 'b')).toBe(-1);
    expect(byCodeUnit('b', 'a')).toBe(1);
  });

  it('reads two equal strings as equal', () => {
    expect(byCodeUnit('tv.kroma.vpn', 'tv.kroma.vpn')).toBe(0);
  });

  it('keeps every capital before every lowercase, as a locale sort would not', () => {
    expect(['b', 'A', 'a', 'B'].sort(byCodeUnit)).toEqual(['A', 'B', 'a', 'b']);
  });

  it('orders accents by code point rather than beside their base letter', () => {
    expect(byCodeUnit('zoo', 'école')).toBe(-1);
  });
});
