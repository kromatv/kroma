import { describe, expect, it } from 'vitest';
import { sharedBoxStyle } from './box-style';

describe('sharedBoxStyle', () => {
  it('hands back the same object for the same key, so styleq can cache it', () => {
    expect(sharedBoxStyle('row-gap-8', { row: true, gap: 8 })).toBe(
      sharedBoxStyle('row-gap-8', { row: true, gap: 8 }),
    );
  });

  it('stops caching past the cap rather than growing without bound', () => {
    for (let i = 0; i < 4096; i++) sharedBoxStyle(`w-${i}`, { w: i });
    expect(sharedBoxStyle('over-the-cap', { w: 1 })).not.toBe(
      sharedBoxStyle('over-the-cap', { w: 1 }),
    );
  });
});
