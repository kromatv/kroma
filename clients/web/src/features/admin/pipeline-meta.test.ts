import { color } from '@kroma/ui/kit';
import { describe, expect, it } from 'vitest';
import { fmtDur, kindMeta, overallMeta, posterGrad, statusMeta } from './pipeline-meta';

describe('fmtDur', () => {
  it('returns an empty string when there is no duration', () => {
    expect(fmtDur(0)).toBe('');
    expect(fmtDur(null)).toBe('');
    expect(fmtDur(undefined)).toBe('');
  });

  it('shows minutes below an hour', () => {
    expect(fmtDur(42 * 60_000)).toBe('42 min');
  });

  it('shows "H h MM" from an hour up, zero-padding the minutes', () => {
    expect(fmtDur(60 * 60_000)).toBe('1 h 00');
    expect(fmtDur(65 * 60_000)).toBe('1 h 05');
    expect(fmtDur(102 * 60_000)).toBe('1 h 42');
  });
});

describe('statusMeta', () => {
  it('resolves the known per-treatment statuses', () => {
    expect(statusMeta('done').dot).toBe(color('success'));
    expect(statusMeta('failed').dot).toBe(color('danger'));
    expect(statusMeta('running').pulse).toBe(true);
  });

  it('falls back to the pending style for unknown / pending / missing', () => {
    const fallback = statusMeta('pending');
    expect(statusMeta('missing')).toEqual(fallback);
    expect(statusMeta('totally-unknown')).toEqual(fallback);
    expect(fallback.pulse).toBeUndefined();
  });
});

describe('overallMeta', () => {
  it('resolves the known roll-up states', () => {
    expect(overallMeta('ok').dot).toBe(color('success'));
    expect(overallMeta('running').pulse).toBe(true);
    expect(overallMeta('failed').color).toBe(color('danger'));
  });

  it('falls back to the pending roll-up for unknown states', () => {
    expect(overallMeta('nope')).toEqual(overallMeta('pending'));
  });
});

describe('kindMeta', () => {
  it('maps element kinds to their badge + i18n type key', () => {
    expect(kindMeta('film').typeKey).toBe('movie');
    expect(kindMeta('series').typeKey).toBe('show');
    expect(kindMeta('episode').typeKey).toBe('episode');
  });

  it('defaults an unknown kind to the film badge', () => {
    expect(kindMeta('other')).toEqual(kindMeta('film'));
  });
});

describe('posterGrad', () => {
  it('is deterministic for a given seed', () => {
    expect(posterGrad('Dune')).toBe(posterGrad('Dune'));
  });

  it('differs for different seeds and is a CSS gradient', () => {
    const a = posterGrad('Dune');
    expect(a.startsWith('radial-gradient(')).toBe(true);
    expect(a).toContain('linear-gradient(');
    expect(a).not.toBe(posterGrad('Arrival'));
  });
});
