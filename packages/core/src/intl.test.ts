import { describe, expect, it } from 'vitest';
import { decimal, formatBytes, formatCount, formatShare } from './intl';

describe('decimal', () => {
  it('separates with a comma in French and a period in English', () => {
    expect(decimal(1.5, 'fr')).toBe('1,5');
    expect(decimal(1.5, 'en')).toBe('1.5');
    expect(decimal(2, 'fr')).toBe('2,0');
  });

  it('honors a requested digit count, rounding', () => {
    expect(decimal(Math.PI, 'fr', 2)).toBe('3,14');
    expect(decimal(Math.PI, 'fr', 0)).toBe('3');
    expect(decimal(Math.E, 'en', 3)).toBe('2.718');
  });
});

describe('formatBytes', () => {
  it('returns the smallest unit for zero and negatives', () => {
    expect(formatBytes(0, 'fr')).toBe('0 o');
    expect(formatBytes(-100, 'fr')).toBe('0 o');
    expect(formatBytes(0, 'en')).toBe('0 B');
  });

  it('rounds a fractional byte count up rather than reading it as 512', () => {
    expect(formatBytes(0.5, 'fr')).toBe('1 o');
    expect(formatBytes(0.5, 'en')).toBe('1 B');
  });

  it('keeps bytes and kilobytes at zero decimals', () => {
    expect(formatBytes(500, 'fr')).toBe('500 o');
    expect(formatBytes(1024, 'fr')).toBe('1 Ko');
    expect(formatBytes(1536, 'fr')).toBe('2 Ko');
    expect(formatBytes(1536, 'en')).toBe('2 KB');
  });

  it('shows one decimal from megabytes up, below a mantissa of 100', () => {
    expect(formatBytes(1024 ** 2, 'fr')).toBe('1,0 Mo');
    expect(formatBytes(5 * 1024 ** 2, 'en')).toBe('5.0 MB');
    expect(formatBytes(1024 ** 3, 'en')).toBe('1.0 GB');
    expect(formatBytes(1024 ** 5, 'fr')).toBe('1,0 Po');
  });

  it('drops the decimal once the mantissa reaches 100', () => {
    expect(formatBytes(150 * 1024 ** 2, 'fr')).toBe('150 Mo');
  });

  it('caps the unit at petabytes for huge inputs', () => {
    expect(formatBytes(1024 ** 6, 'fr')).toBe('1024 Po');
    expect(formatBytes(1024 ** 6, 'en')).toBe('1024 PB');
  });
});

describe('formatCount', () => {
  it('groups a large count the way the locale groups it', () => {
    expect(formatCount(31, 'en')).toBe('31');
    expect(formatCount(1498, 'en')).toBe('1,498');
    expect(formatCount(1498, 'fr')).toBe('1\u202f498');
  });

  it('rounds a fractional count rather than printing one', () => {
    expect(formatCount(4.6, 'en')).toBe('5');
  });
});

describe('formatShare', () => {
  it('spaces the sign the way the locale spaces it', () => {
    expect(formatShare(0.34, 'en')).toBe('34%');
    expect(formatShare(0.34, 'fr')).toBe('34\u00a0%');
  });

  it('rounds down, so nothing reads finished before it is', () => {
    expect(formatShare(0.999, 'en')).toBe('99%');
    expect(formatShare(1, 'en')).toBe('100%');
  });

  it('clamps a fraction the source sent outside the range', () => {
    expect(formatShare(-0.2, 'en')).toBe('0%');
    expect(formatShare(4, 'en')).toBe('100%');
  });
});
