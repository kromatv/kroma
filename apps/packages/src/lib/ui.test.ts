import { describe, expect, it } from 'vitest';
import { shortHash } from './ui';

describe('shortHash', () => {
  it('keeps the two ends a checksum is compared by', () => {
    const digest = `0123abcd${'f'.repeat(48)}deadbeef`;
    expect(shortHash(digest)).toBe('0123abcd…deadbeef');
  });

  it('leaves anything short enough to read whole alone', () => {
    expect(shortHash('a'.repeat(20))).toBe('a'.repeat(20));
    expect(shortHash('')).toBe('');
  });
});
