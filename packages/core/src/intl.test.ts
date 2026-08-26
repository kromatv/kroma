import { describe, expect, it } from 'vitest';
import { createTranslator } from './i18n';
import {
  decimal,
  formatBytes,
  formatDuration,
  formatElapsed,
  formatHours,
  formatMbps,
  formatTimecode,
  formatTimecodeMs,
  formatUptime,
} from './intl';

const fr = createTranslator('fr');
const en = createTranslator('en');
const NOW = Date.parse('2024-06-15T12:00:00Z');

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

describe('formatMbps', () => {
  it('gives one decimal in the locale, and reads a NaN as zero', () => {
    expect(formatMbps(5, 'fr')).toBe('5,0');
    expect(formatMbps(12.34, 'fr')).toBe('12,3');
    expect(formatMbps(12.34, 'en')).toBe('12.3');
    expect(formatMbps(Number.NaN, 'en')).toBe('0.0');
  });
});

describe('formatTimecode', () => {
  it('omits the hour when under an hour', () => {
    expect(formatTimecode(0)).toBe('0:00');
    expect(formatTimecode(9)).toBe('0:09');
    expect(formatTimecode(247)).toBe('4:07');
  });

  it('shows hours with zero-padded minutes above an hour', () => {
    expect(formatTimecode(3847)).toBe('1:04:07');
    expect(formatTimecode(3600)).toBe('1:00:00');
  });

  it('clamps NaN and negatives to zero', () => {
    expect(formatTimecode(-5)).toBe('0:00');
    expect(formatTimecode(Number.NaN)).toBe('0:00');
  });

  it('reads milliseconds through the ms variant', () => {
    expect(formatTimecodeMs(3_847_000)).toBe('1:04:07');
    expect(formatTimecodeMs(0)).toBe('0:00');
  });
});

describe('formatHours', () => {
  it('gives one decimal in the locale', () => {
    expect(formatHours(14.3 * 3_600_000, 'fr')).toBe('14,3 h');
    expect(formatHours(14.3 * 3_600_000, 'en')).toBe('14.3 h');
    expect(formatHours(0, 'fr')).toBe('0,0 h');
  });
});

describe('formatDuration', () => {
  it('drops the hour below sixty minutes', () => {
    expect(formatDuration(fr, 8 * 60_000)).toBe('8 min');
    expect(formatDuration(fr, 0)).toBe('0 min');
  });

  it('zero-pads the minutes beside an hour', () => {
    expect(formatDuration(fr, (4 * 60 + 9) * 60_000)).toBe('4 h 09 min');
    expect(formatDuration(en, (4 * 60 + 29) * 60_000)).toBe('4 h 29 min');
  });
});

describe('formatUptime', () => {
  it('scales from minutes to days', () => {
    expect(formatUptime(fr, 8 * 60)).toBe('8 min');
    expect(formatUptime(fr, 4 * 3600 + 12 * 60)).toBe('4 h 12 min');
  });

  it('names the day in the reader language', () => {
    expect(formatUptime(fr, 18 * 86400 + 4 * 3600)).toBe('18 j 04 h');
    expect(formatUptime(en, 18 * 86400 + 4 * 3600)).toBe('18 d 04 h');
  });
});

describe('formatElapsed', () => {
  it('handles a missing or unparseable timestamp', () => {
    expect(formatElapsed(fr, 'fr', null, NOW)).toBe('jamais');
    expect(formatElapsed(en, 'en', undefined, NOW)).toBe('never');
    expect(formatElapsed(fr, 'fr', 'not-a-date', NOW)).toBe('-');
  });

  // French puts a no-break space before the unit, which is what stops "5 min"
  // wrapping across two lines. Intl knows that; the keys this replaced did not.
  it('reads a French relative label from an ISO timestamp', () => {
    expect(formatElapsed(fr, 'fr', '2024-06-15T11:59:30Z', NOW)).toBe("à l'instant");
    expect(formatElapsed(fr, 'fr', '2024-06-15T11:55:00Z', NOW)).toBe('il y a 5\u00a0min');
    expect(formatElapsed(fr, 'fr', '2024-06-15T09:00:00Z', NOW)).toBe('il y a 3\u00a0h');
    expect(formatElapsed(fr, 'fr', '2024-06-14T11:00:00Z', NOW)).toBe('hier');
    expect(formatElapsed(fr, 'fr', '2024-06-12T12:00:00Z', NOW)).toBe('il y a 3\u00a0j');
  });

  it('says avant-hier in French, which no hand-written ladder here ever did', () => {
    expect(formatElapsed(fr, 'fr', '2024-06-13T11:00:00Z', NOW)).toBe('avant-hier');
  });

  it('reads an English relative label from the same timestamps', () => {
    expect(formatElapsed(en, 'en', '2024-06-15T11:59:30Z', NOW)).toBe('just now');
    expect(formatElapsed(en, 'en', '2024-06-15T11:55:00Z', NOW)).toBe('5 min. ago');
    expect(formatElapsed(en, 'en', '2024-06-15T09:00:00Z', NOW)).toBe('3 hr. ago');
    expect(formatElapsed(en, 'en', '2024-06-14T11:00:00Z', NOW)).toBe('yesterday');
    expect(formatElapsed(en, 'en', '2024-06-12T12:00:00Z', NOW)).toBe('3 days ago');
  });

  it('reads epoch milliseconds as readily as an ISO string', () => {
    const iso = '2024-06-15T11:55:00Z';

    expect(formatElapsed(fr, 'fr', Date.parse(iso), NOW)).toBe(formatElapsed(fr, 'fr', iso, NOW));
  });

  it('falls back to an absolute date past a month, ordered for the locale', () => {
    expect(formatElapsed(fr, 'fr', '2024-05-06T12:00:00Z', NOW)).toBe('06/05/2024');
    expect(formatElapsed(en, 'en', '2024-05-06T12:00:00Z', NOW)).toBe('5/6/24');
  });
});
