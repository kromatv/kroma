import { createTranslator } from '@kromatv/core';
import type { Translate, TVars } from '@kromatv/i18n';
import { describe, expect, it, vi } from 'vitest';
import {
  type Language,
  decimal,
  formatBytes,
  formatClock,
  formatCount,
  formatDuration,
  formatElapsed,
  formatGigabytes,
  formatHours,
  formatMbps,
  formatTimecode,
  formatTimecodeMs,
  formatUptime,
} from './intl';

const fr = createTranslator('fr');
const en = createTranslator('en');
const words: Translate = (key: string, vars?: TVars) => `${key}:${String(vars?.hours)}`;
const french: Language = { locale: 'fr', t: fr };
const english: Language = { locale: 'en', t: en };
const korean: Language = { locale: 'ko', t: createTranslator('ko') };
const german: Language = { locale: 'de', t: createTranslator('de') };
const NOW = Date.parse('2024-06-15T12:00:00Z');

describe('decimal', () => {
  it('separates with a comma in French and a period in English', () => {
    expect(decimal(french, 1.5)).toBe('1,5');
    expect(decimal(english, 1.5)).toBe('1.5');
    expect(decimal(french, 2)).toBe('2,0');
  });

  it('honors a requested digit count, rounding', () => {
    expect(decimal(french, Math.PI, 2)).toBe('3,14');
    expect(decimal(french, Math.PI, 0)).toBe('3');
    expect(decimal(english, Math.E, 3)).toBe('2.718');
  });
});

describe('formatCount', () => {
  it('groups thousands the way toLocaleString does', () => {
    for (const n of [0, 7, 1064, 1234567]) {
      for (const language of [french, english]) {
        expect(formatCount(language, n)).toBe(n.toLocaleString(language.locale));
      }
    }
  });
});

describe('formatClock', () => {
  it('reads the time on a 24-hour clock, as toLocaleTimeString does', () => {
    const evening = new Date(2024, 5, 15, 20, 5);
    const morning = new Date(2024, 5, 15, 9, 7);

    expect(formatClock(evening)).toBe(
      evening.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
    );
    expect(formatClock(morning)).toBe('09:07');
  });
});

describe('formatBytes', () => {
  it('returns the smallest unit for zero and negatives', () => {
    expect(formatBytes(french, 0)).toBe('0 o');
    expect(formatBytes(french, -100)).toBe('0 o');
    expect(formatBytes(english, 0)).toBe('0 B');
  });

  it('rounds a fractional byte count up rather than reading it as 512', () => {
    expect(formatBytes(french, 0.5)).toBe('1 o');
    expect(formatBytes(english, 0.5)).toBe('1 B');
  });

  it('keeps bytes and kilobytes at zero decimals', () => {
    expect(formatBytes(french, 500)).toBe('500 o');
    expect(formatBytes(french, 1024)).toBe('1 Ko');
    expect(formatBytes(french, 1536)).toBe('2 Ko');
    expect(formatBytes(english, 1536)).toBe('2 KB');
  });

  it('shows one decimal from megabytes up, below a mantissa of 100', () => {
    expect(formatBytes(french, 1024 ** 2)).toBe('1,0 Mo');
    expect(formatBytes(english, 5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(english, 1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(french, 1024 ** 5)).toBe('1,0 Po');
  });

  it('drops the decimal once the mantissa reaches 100', () => {
    expect(formatBytes(french, 150 * 1024 ** 2)).toBe('150 Mo');
  });

  it('caps the unit at petabytes for huge inputs', () => {
    expect(formatBytes(french, 1024 ** 6)).toBe('1024 Po');
    expect(formatBytes(english, 1024 ** 6)).toBe('1024 PB');
  });

  it('writes the units the language catalog gives', () => {
    expect(formatBytes(korean, 1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(german, 1.5 * 1024 ** 3)).toBe('1,5 GB');
  });
});

describe('formatGigabytes', () => {
  it('writes a size picked in gigabytes with the locale unit and no forced decimal', () => {
    expect(formatGigabytes(french, 40)).toBe('40 Go');
    expect(formatGigabytes(english, 40)).toBe('40 GB');
    expect(formatGigabytes(korean, 256)).toBe('256 GB');
  });

  it('keeps a fraction with the locale separator', () => {
    expect(formatGigabytes(french, 1.5)).toBe('1,5 Go');
    expect(formatGigabytes(english, 1.5)).toBe('1.5 GB');
  });
});

describe('formatMbps', () => {
  it('gives one decimal in the locale, and reads a NaN as zero', () => {
    expect(formatMbps(french, 5)).toBe('5,0');
    expect(formatMbps(french, 12.34)).toBe('12,3');
    expect(formatMbps(english, 12.34)).toBe('12.3');
    expect(formatMbps(english, Number.NaN)).toBe('0.0');
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
    expect(formatHours(french, 14.3 * 3_600_000)).toBe('14,3 h');
    expect(formatHours(english, 14.3 * 3_600_000)).toBe('14.3 h');
    expect(formatHours(french, 0)).toBe('0,0 h');
  });

  it('takes its unit from the catalog of the language on screen', () => {
    expect(formatHours({ locale: 'en', t: words }, 1.5 * 3_600_000)).toBe('format.hours:1.5');
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
    expect(formatElapsed(french, null, NOW)).toBe('jamais');
    expect(formatElapsed(english, undefined, NOW)).toBe('never');
    expect(formatElapsed(french, 'not-a-date', NOW)).toBe('-');
  });

  // French puts a no-break space before the unit, which is what stops "5 min"
  // wrapping across two lines. Intl knows that; the keys this replaced did not.
  it('reads a French relative label from an ISO timestamp', () => {
    expect(formatElapsed(french, '2024-06-15T11:59:30Z', NOW)).toBe("à l'instant");
    expect(formatElapsed(french, '2024-06-15T11:55:00Z', NOW)).toBe('il y a 5\u00a0min');
    expect(formatElapsed(french, '2024-06-15T09:00:00Z', NOW)).toBe('il y a 3\u00a0h');
    expect(formatElapsed(french, '2024-06-14T11:00:00Z', NOW)).toBe('hier');
    expect(formatElapsed(french, '2024-06-12T12:00:00Z', NOW)).toBe('il y a 3\u00a0j');
  });

  it('says avant-hier in French, which no hand-written ladder here ever did', () => {
    expect(formatElapsed(french, '2024-06-13T11:00:00Z', NOW)).toBe('avant-hier');
  });

  it('reads an English relative label from the same timestamps', () => {
    expect(formatElapsed(english, '2024-06-15T11:59:30Z', NOW)).toBe('just now');
    expect(formatElapsed(english, '2024-06-15T11:55:00Z', NOW)).toBe('5 min. ago');
    expect(formatElapsed(english, '2024-06-15T09:00:00Z', NOW)).toBe('3 hr. ago');
    expect(formatElapsed(english, '2024-06-14T11:00:00Z', NOW)).toBe('yesterday');
    expect(formatElapsed(english, '2024-06-12T12:00:00Z', NOW)).toBe('3 days ago');
  });

  it('reads epoch milliseconds as readily as an ISO string', () => {
    const iso = '2024-06-15T11:55:00Z';

    expect(formatElapsed(french, Date.parse(iso), NOW)).toBe(formatElapsed(french, iso, NOW));
  });

  it('falls back to an absolute date past a month, ordered for the locale', () => {
    expect(formatElapsed(french, '2024-05-06T12:00:00Z', NOW)).toBe('06/05/2024');
    expect(formatElapsed(english, '2024-05-06T12:00:00Z', NOW)).toBe('5/6/24');
  });
});

function refuses(): never {
  throw new TypeError('unsupported');
}

const withBroken = async (
  name: 'RelativeTimeFormat' | 'DateTimeFormat',
  use: (intl: typeof import('./intl')) => void,
) => {
  vi.resetModules();
  const had = Intl[name];
  Reflect.set(Intl, name, refuses);
  try {
    use(await import('./intl'));
  } finally {
    Reflect.set(Intl, name, had);
  }
};

// The legacy television tier floors at Chromium 53, where the Intl constructors
// this file reaches for either do not exist or refuse the options it asks for.
// Each one falls back rather than taking the app down. The formatters are built
// on first use and cached per locale, so the constructor has to stay broken
// across the call, not just across the import.
describe('an engine without the Intl constructors', () => {
  it('gives the absolute date when there is no relative formatter', async () => {
    await withBroken('RelativeTimeFormat', ({ formatElapsed: elapsed }) => {
      expect(elapsed(french, '2024-06-15T11:55:00Z', NOW)).toBe('15/06/2024');
    });
  });

  it('falls back to plain ISO when no date formatter builds', async () => {
    await withBroken('DateTimeFormat', ({ formatElapsed: elapsed, formatStamp: stamp }) => {
      expect(elapsed(french, '2024-05-06T12:00:00Z', NOW)).toBe('2024-05-06');
      expect(stamp('fr', '2024-05-06T12:00:00Z')).toBe('2024-05-06 12:00');
    });
  });

  it('reads the clock, the decimals and the counts with no Intl at all', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', undefined);
    try {
      const intl = await import('./intl');

      expect(intl.formatClock(new Date(2024, 5, 15, 20, 5))).toBe('20:05');
      expect(intl.decimal(french, 1.25, 1)).toBe('1,3');
      expect(intl.decimal(english, 1.5)).toBe('1.5');
      expect(intl.formatCount(french, 1234567)).toBe((1234567).toLocaleString('fr'));
      expect(intl.formatCount(english, 1064)).toBe('1,064');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('takes the separators and the units from the language catalog', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', undefined);
    try {
      const intl = await import('./intl');

      expect(intl.formatBytes(french, 1.5 * 1024 ** 3)).toBe('1,5 Go');
      expect(intl.formatCount(french, 1234.5)).toBe('1\u202F234,5');
      expect(intl.formatBytes(german, 1.5 * 1024 ** 3)).toBe('1,5 GB');
      expect(intl.formatCount(german, 1234.5)).toBe('1.234,5');
      expect(intl.formatGigabytes(german, 1500)).toBe('1.500 GB');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('writes the plain separators for a catalog that gives no sample', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', undefined);
    try {
      const intl = await import('./intl');
      const silent: Language = { locale: 'fr', t: words };

      expect(intl.formatCount(silent, 1234.5)).toBe('1,234.5');
      expect(intl.decimal(silent, 1.5)).toBe('1.5');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
