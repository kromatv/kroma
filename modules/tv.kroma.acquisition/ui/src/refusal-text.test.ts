// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRefusalText } from './refusal-text';

vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  const fmt = { bytes: (n: number) => `${n}B` };
  return { useT: () => t, useFormat: () => fmt };
});

function refusal(rule: string, params: Record<string, unknown> = {}) {
  const { result } = renderHook(() => useRefusalText());
  return result.current({ rule, params });
}

describe('a refusal text', () => {
  it('falls back to the server sentence when there is no refusal', () => {
    const { result } = renderHook(() => useRefusalText());

    expect(result.current(null, 'server')).toBe('server');
    expect(result.current(undefined)).toBeNull();
  });

  it('writes the quality, and says so when it is unknown', () => {
    expect(refusal('quality', { quality: 'webdl-1080p' })).toBe(
      'acq.refusal.quality {"quality":"WEB-DL 1080p"}',
    );
    expect(refusal('quality', { quality: 'unknown' })).toContain('acq.qualityUnknown');
    expect(refusal('quality')).toContain('acq.qualityUnknown');
  });

  it('writes a shortfall of score or seeders', () => {
    expect(refusal('format-score', { have: 1, need: 5 })).toBe(
      'acq.refusal.formatScore {"have":1,"need":5}',
    );
    expect(refusal('seeders', { have: 0, need: 2 })).toBe(
      'acq.refusal.seeders {"have":0,"need":2}',
    );
    expect(refusal('seeders')).toBe('acq.refusal.seeders {"have":0,"need":0}');
  });

  it('writes the keyword rules', () => {
    expect(refusal('forbidden-keyword', { term: 'cam' })).toBe(
      'acq.refusal.forbiddenKeyword {"term":"cam"}',
    );
    expect(refusal('missing-required-keyword', { terms: 'a, b' })).toBe(
      'acq.refusal.missingKeyword {"terms":"a, b"}',
    );
  });

  it('writes sizes in the reader format', () => {
    expect(refusal('too-small', { sizeBytes: 5, limitBytes: 10 })).toBe(
      'acq.refusal.tooSmall {"size":"5B","limit":"10B"}',
    );
    expect(refusal('too-big', { sizeBytes: 50, limitBytes: 10 })).toBe(
      'acq.refusal.tooBig {"size":"50B","limit":"10B"}',
    );
  });

  it('names the shapes of a wrong-shape release', () => {
    expect(refusal('wrong-shape', { wanted: 'movie', found: 'season' })).toBe(
      'acq.refusal.wrongShape {"wanted":"acq.shapeMovie","found":"acq.shapeSeason"}',
    );
    expect(refusal('wrong-shape', { wanted: 'episode', found: 'odd' })).toContain(
      '"found":"acq.shapeNone"',
    );
  });

  it('writes the year, season and episode mismatches', () => {
    expect(refusal('wrong-year', { year: 1999, wantedYear: 2000 })).toBe(
      'acq.refusal.wrongYear {"year":1999,"wantedYear":2000}',
    );
    expect(refusal('wrong-season', { season: 1, wantedSeason: 2 })).toBe(
      'acq.refusal.wrongSeason {"season":1,"wantedSeason":2}',
    );
    expect(
      refusal('wrong-episode', { season: 1, episode: 2, wantedSeason: 3, wantedEpisode: 14 }),
    ).toBe('acq.refusal.wrongEpisode {"unit":"S01E02","wanted":"S03E14"}');
  });

  it('writes a blocklisted release', () => {
    expect(refusal('blocklist')).toBe('acq.refusal.blocklist');
  });

  it('uses the server sentence, then a generic one, for a rule it does not know', () => {
    const { result } = renderHook(() => useRefusalText());

    expect(result.current({ rule: 'new-rule', params: {} }, 'server says no')).toBe(
      'server says no',
    );
    expect(result.current({ rule: 'new-rule', params: {} })).toBe('acq.refusal.other');
  });
});
