import { describe, expect, it } from 'vitest';
import { formatDay, formatMoment, formatMonth, groupByMonth, monthKey } from './day.ts';

describe('formatDay', () => {
  it('reads a release day in the language of the page', () => {
    expect(formatDay('2026-08-14', 'en')).toBe('August 14, 2026');
    expect(formatDay('2026-08-14', 'fr')).toBe('14 août 2026');
  });

  it('keeps the day GitHub stamped rather than shifting it into the local zone', () => {
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';

    const rendered = formatDay('2026-01-01', 'en');

    process.env.TZ = tz;
    expect(rendered).toBe('January 1, 2026');
  });
});

describe('formatMoment', () => {
  it('reads a build time as a date and a clock, which is what tells two builds of one day apart', () => {
    const moment = formatMoment('2026-08-21T03:58:35Z', 'en');

    expect(moment).toContain('2026');
    expect(moment).toMatch(/\d{1,2}:\d{2}/);
  });

  it('answers null for a build that carries no time, and for one that carries nonsense', () => {
    expect(formatMoment(null, 'en')).toBeNull();
    expect(formatMoment(undefined, 'en')).toBeNull();
    expect(formatMoment('', 'en')).toBeNull();
    expect(formatMoment('not a date', 'en')).toBeNull();
  });
});

describe('monthKey', () => {
  it('takes the month an instant falls in', () => {
    expect(monthKey('2026-08-21T03:58:35Z')).toBe('2026-08');
    expect(monthKey('2026-01-01T00:00:00Z')).toBe('2026-01');
  });

  it('answers null rather than a key for anything that is not an instant', () => {
    expect(monthKey(null)).toBeNull();
    expect(monthKey(undefined)).toBeNull();
    expect(monthKey('nope')).toBeNull();
  });
});

describe('formatMonth', () => {
  it('names the month in the language of the page', () => {
    expect(formatMonth('2026-08', 'en')).toBe('August 2026');
    expect(formatMonth('2026-08', 'fr')).toBe('août 2026');
  });

  it('stays on the month GitHub stamped rather than shifting west of Greenwich', () => {
    expect(formatMonth('2026-01', 'en')).toBe('January 2026');
  });
});

describe('groupByMonth', () => {
  const at = (item: { at: string | null }) => item.at;

  it('keeps the order it was given and opens a group per month', () => {
    const items = [
      { at: '2026-08-21T10:00:00Z' },
      { at: '2026-08-15T10:00:00Z' },
      { at: '2026-07-31T10:00:00Z' },
    ];

    expect(groupByMonth(items, at).map((g) => [g.key, g.items.length])).toEqual([
      ['2026-08', 2],
      ['2026-07', 1],
    ]);
  });

  it('collects the undated under a null key rather than dropping them', () => {
    const groups = groupByMonth([{ at: null }, { at: '2026-08-01T00:00:00Z' }], at);

    expect(groups.map((g) => g.key)).toEqual([null, '2026-08']);
  });

  it('opens a second group when a month comes back after another', () => {
    const items = [
      { at: '2026-08-21T10:00:00Z' },
      { at: '2026-07-01T10:00:00Z' },
      { at: '2026-08-01T10:00:00Z' },
    ];

    expect(groupByMonth(items, at).map((g) => g.key)).toEqual(['2026-08', '2026-07', '2026-08']);
  });
});
