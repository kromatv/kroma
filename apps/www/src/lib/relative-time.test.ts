import { describe, expect, it } from 'vitest';
import { relativeTime } from './relative-time';

const NOW = 1_800_000_000;

describe('relativeTime', () => {
  it('picks the largest unit the gap fills', () => {
    expect(relativeTime(NOW - 40, NOW, 'en')).toBe('40 seconds ago');
    expect(relativeTime(NOW - 130, NOW, 'en')).toBe('2 minutes ago');
    expect(relativeTime(NOW - 3 * 3600, NOW, 'en')).toBe('3 hours ago');
    expect(relativeTime(NOW - 40 * 86_400, NOW, 'en')).toBe('last month');
  });

  it('says yesterday and now rather than counting', () => {
    expect(relativeTime(NOW - 86_400, NOW, 'en')).toBe('yesterday');
    expect(relativeTime(NOW, NOW, 'en')).toBe('now');
  });

  it('speaks the reader’s language', () => {
    expect(relativeTime(NOW - 2 * 3600, NOW, 'fr')).toBe('il y a 2 heures');
  });

  it('runs out at years rather than falling off the end', () => {
    expect(relativeTime(NOW - 3 * 365 * 86_400, NOW, 'en')).toBe('3 years ago');
  });
});
