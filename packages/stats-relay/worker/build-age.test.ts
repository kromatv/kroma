import { describe, expect, it } from 'vitest';
import { buildAge, buildAges } from './build-age';

const DAY = 86_400;
const NOW = 1_800_000_000;
const EPOCH = Date.UTC(2020, 0, 1) / 1000;

const builtDaysAgo = (days: number) => Math.floor((NOW - days * DAY - EPOCH) / 60);

describe('buildAge', () => {
  it('reads a build number as the minute it was made and bands its age', () => {
    expect(buildAge(builtDaysAgo(2), NOW)).toBe('week');
    expect(buildAge(builtDaysAgo(20), NOW)).toBe('month');
    expect(buildAge(builtDaysAgo(60), NOW)).toBe('quarter');
    expect(buildAge(builtDaysAgo(200), NOW)).toBe('older');
  });

  it('calls build 0 a server built from source, whatever the date', () => {
    expect(buildAge(0, NOW)).toBe('source');
  });

  it('reads a build stamped after now as this week rather than refusing it', () => {
    expect(buildAge(builtDaysAgo(-1), NOW)).toBe('week');
  });
});

describe('buildAges', () => {
  it('lists the bands newest first whatever their weight, and leaves out empty ones', () => {
    const builds = [0, builtDaysAgo(200), builtDaysAgo(200), builtDaysAgo(1)];

    expect(buildAges(builds, NOW)).toEqual([
      { key: 'week', n: 1 },
      { key: 'older', n: 2 },
      { key: 'source', n: 1 },
    ]);
  });
});
