import { describe, expect, it } from 'vitest';
import { kindMeta, overallMeta, statusMeta } from './pipeline-meta';

describe('statusMeta', () => {
  it('resolves the known per-treatment statuses', () => {
    expect(statusMeta('done').dot).toBe('success');
    expect(statusMeta('failed').dot).toBe('danger');
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
    expect(overallMeta('ok').dot).toBe('success');
    expect(overallMeta('running').pulse).toBe(true);
    expect(overallMeta('failed').color).toBe('danger');
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
