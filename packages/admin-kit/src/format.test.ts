import { describe, expect, it } from 'vitest';
import { avatarGradient, decimal, formatBytes, hue, initial } from './format';

describe('hue', () => {
  it('is deterministic and bounded to 0..359', () => {
    for (const s of ['', 'a', 'Alice', 'a very long name here', '日本語']) {
      const h = hue(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
      expect(hue(s)).toBe(h); // stable across calls
    }
  });

  it('returns 0 for the empty string and a nullish input', () => {
    expect(hue('')).toBe(0);
    expect(hue(undefined as unknown as string)).toBe(0);
  });

  it('depends on the exact characters', () => {
    expect(hue('ab')).not.toBe(hue('ba'));
  });
});

describe('avatarGradient', () => {
  it('embeds the seed hue and its +40 companion', () => {
    const h = hue('Alice');
    const g = avatarGradient('Alice');
    expect(g).toContain(`hsl(${h} 48% 46%)`);
    expect(g).toContain(`hsl(${(h + 40) % 360} 54% 26%)`);
    expect(g.startsWith('linear-gradient(140deg,')).toBe(true);
  });
});

describe('initial', () => {
  it('upper-cases the first character', () => {
    expect(initial('bob')).toBe('B');
    expect(initial('émile')).toBe('É');
  });

  it('falls back to "?" for empty / nullish names', () => {
    expect(initial('')).toBe('?');
    expect(initial(undefined as unknown as string)).toBe('?');
  });
});

describe('decimal', () => {
  it('uses a comma and one decimal place by default', () => {
    expect(decimal(1.5)).toBe('1,5');
    expect(decimal(2)).toBe('2,0');
  });

  it('honors a requested digit count (rounding)', () => {
    expect(decimal(Math.PI, 2)).toBe('3,14');
    expect(decimal(Math.PI, 0)).toBe('3');
    expect(decimal(Math.E, 3)).toBe('2,718');
  });
});

describe('formatBytes', () => {
  it('returns "0 o" for zero and negatives', () => {
    expect(formatBytes(0)).toBe('0 o');
    expect(formatBytes(-100)).toBe('0 o');
  });

  it('keeps bytes and kilobytes at 0 decimals', () => {
    expect(formatBytes(500)).toBe('500 o');
    expect(formatBytes(1024)).toBe('1 Ko');
    expect(formatBytes(1536)).toBe('2 Ko'); // 1.5 KiB rounds to 2 at 0 digits
  });

  it('shows one decimal from megabytes up (below 100)', () => {
    expect(formatBytes(1024 ** 2)).toBe('1,0 Mo');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5,0 Mo');
    expect(formatBytes(1024 ** 3)).toBe('1,0 Go');
    expect(formatBytes(1024 ** 5)).toBe('1,0 Po');
  });

  it('drops the decimal once the mantissa reaches 100', () => {
    expect(formatBytes(150 * 1024 ** 2)).toBe('150 Mo');
  });

  it('caps the unit at Po (petabytes) for huge inputs', () => {
    expect(formatBytes(1024 ** 6)).toBe('1024 Po');
  });
});
