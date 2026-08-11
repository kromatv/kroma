import { describe, expect, it } from 'vitest';
import {
  daysFromToday,
  monthKey,
  monthLabel,
  relativeAirDate,
  sentenceCase,
  shortDayLabel,
} from './airdate';

// A fixed "now" (a Wednesday, mid-month) keeps every relative result stable.
const NOW = new Date('2026-07-15T14:30:00');

describe('daysFromToday', () => {
  it('is 0 for today, positive for the future, negative for the past', () => {
    expect(daysFromToday('2026-07-15', NOW)).toBe(0);
    expect(daysFromToday('2026-07-16', NOW)).toBe(1);
    expect(daysFromToday('2026-07-10', NOW)).toBe(-5);
  });

  it('counts across month boundaries', () => {
    expect(daysFromToday('2026-08-01', NOW)).toBe(17);
  });
});

describe('relativeAirDate', () => {
  it('is empty for an undated value', () => {
    expect(relativeAirDate(null, 'en', NOW)).toBe('');
  });

  it('uses days below a month, in both directions', () => {
    expect(relativeAirDate('2026-07-16', 'en', NOW)).toBe('tomorrow');
    expect(relativeAirDate('2026-07-14', 'en', NOW)).toBe('yesterday');
    expect(relativeAirDate('2026-07-20', 'en', NOW)).toBe('in 5 days');
    expect(relativeAirDate('2026-07-01', 'en', NOW)).toBe('14 days ago');
  });

  it('scales to months, then years (no "in 245 days")', () => {
    expect(relativeAirDate('2026-10-15', 'en', NOW)).toBe('in 3 months');
    expect(relativeAirDate('2026-03-15', 'en', NOW)).toBe('4 months ago');
    expect(relativeAirDate('2028-07-15', 'en', NOW)).toBe('in 2 years');
  });

  it('localizes (french)', () => {
    expect(relativeAirDate('2026-07-16', 'fr', NOW)).toBe('demain');
    expect(relativeAirDate('2026-05-15', 'fr', NOW)).toBe('il y a 2 mois');
  });
});

describe('sentenceCase', () => {
  it('opens a relative date as a sentence, and leaves the rest of it alone', () => {
    expect(sentenceCase(relativeAirDate('2026-07-18', 'fr', NOW), 'fr')).toBe('Dans 3 jours');
  });

  it('has nothing to capitalise in an undated value', () => {
    expect(sentenceCase('', 'fr')).toBe('');
  });

  it('leaves a line that opens on a digit as it is', () => {
    expect(sentenceCase('3 jours', 'fr')).toBe('3 jours');
  });

  it('capitalises the way the locale does, not the way ASCII does', () => {
    // Turkish is the case where a locale-blind uppercase is visibly wrong: the
    // capital of a dotted "i" keeps its dot.
    expect(sentenceCase('istanbul', 'tr')).toBe('İstanbul');
    expect(sentenceCase('istanbul', 'en')).toBe('Istanbul');
  });
});

describe('shortDayLabel / monthLabel', () => {
  it('renders a compact weekday + day + month', () => {
    expect(shortDayLabel('2026-07-24', 'en')).toMatch(/Fri/);
    expect(shortDayLabel('2026-07-24', 'en')).toMatch(/24/);
    expect(shortDayLabel('2026-07-24', 'fr')).toMatch(/ven/i);
  });

  it('renders the month heading with its year', () => {
    expect(monthLabel('2026-07-24', 'en')).toBe('July 2026');
    expect(monthLabel('2026-07-24', 'fr')).toBe('juillet 2026');
  });
});

describe('monthKey', () => {
  it('buckets by YYYY-MM', () => {
    expect(monthKey('2026-07-24')).toBe('2026-07');
    expect(monthKey('2027-01-02')).toBe('2027-01');
  });
});

describe('the default clock', () => {
  const today = new Date();
  const iso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  it('measures against today when no clock is given', () => {
    expect(daysFromToday(iso)).toBe(0);
    expect(relativeAirDate(iso, 'en')).toBe('today');
  });
});
