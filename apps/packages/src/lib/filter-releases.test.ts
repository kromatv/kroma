import { describe, expect, it } from 'vitest';
import { filterReleases } from './filter-releases';
import type { Release } from './release';

const release = (over: Partial<Release> = {}): Release => ({
  channel: 'stable',
  version: '0.1.36-3461233',
  day: '2026-07-31',
  size: '81.2 MB',
  spk: 'https://dl/kroma.spk',
  release: 'https://github.com/o/r/releases/v0.1.36',
  notes: '',
  md5: null,
  ...over,
});

const catalog = [
  release(),
  release({ version: '0.1.35-3400000', day: '2026-06-02' }),
  release({ channel: 'nightly', version: '0.1.37-3470000' }),
];

describe('filterReleases', () => {
  it('returns the list untouched for a blank query', () => {
    expect(filterReleases(catalog, '   ')).toBe(catalog);
  });

  it('matches a version fragment', () => {
    expect(filterReleases(catalog, '0.1.35')).toHaveLength(1);
  });

  it('matches a channel, whatever the case', () => {
    expect(filterReleases(catalog, 'NIGHTLY')).toHaveLength(1);
  });

  it('matches the day', () => {
    expect(filterReleases(catalog, '2026-06')).toHaveLength(1);
  });

  it('matches nothing when nothing matches', () => {
    expect(filterReleases(catalog, 'zzz')).toHaveLength(0);
  });
});
