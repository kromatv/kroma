import { describe, expect, it } from 'vitest';
import { nextPage, pageAt } from './pager';

describe('pageAt', () => {
  it('names the page a swipe has travelled more than half way to', () => {
    expect(pageAt(190, 390, 4)).toBe(0);
    expect(pageAt(200, 390, 4)).toBe(1);
  });

  it('reads an overscroll past either end as that end', () => {
    expect(pageAt(-40, 390, 4)).toBe(0);
    expect(pageAt(1700, 390, 4)).toBe(3);
  });

  it('stays on the first page before the pager has a width', () => {
    expect(pageAt(120, 0, 4)).toBe(0);
  });
});

describe('nextPage', () => {
  it('turns one page on', () => {
    expect(nextPage(1, 4)).toBe(2);
  });

  it('returns to the first page after the last', () => {
    expect(nextPage(3, 4)).toBe(0);
  });

  it('stays put with nothing to turn', () => {
    expect(nextPage(0, 0)).toBe(0);
  });
});
