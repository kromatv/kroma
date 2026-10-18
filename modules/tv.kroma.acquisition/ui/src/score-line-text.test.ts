// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type ScoreLineLike, useScoreLineText } from './score-line-text';

vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  return { useT: () => t };
});

function read(line: ScoreLineLike) {
  const { result } = renderHook(() => useScoreLineText());
  return result.current(line);
}

describe('a score line text', () => {
  it('writes the quality, and says so when it is unknown', () => {
    expect(read({ rule: 'quality', note: 'n', params: { quality: 'bluray-1080p' } })).toBe(
      'acq.score.quality {"quality":"Blu-ray 1080p"}',
    );
    expect(read({ rule: 'quality', note: 'n' })).toBe(
      'acq.score.quality {"quality":"acq.qualityUnknown"}',
    );
  });

  it('names the matched format, or falls back to the note', () => {
    expect(read({ rule: 'format', note: 'n', params: { format: 'VFF' } })).toBe('VFF');
    expect(read({ rule: 'format', note: 'the note' })).toBe('the note');
  });

  it('writes a revision and a season pack from their counts', () => {
    expect(read({ rule: 'revision', note: 'n', params: { revision: 2 } })).toBe(
      'acq.score.revision {"revision":2}',
    );
    expect(read({ rule: 'x', code: 'season-pack', note: 'n', params: { episodes: 8 } })).toBe(
      'acq.score.seasonPack {"count":8}',
    );
  });

  it('prefers the code over the rule, and keeps the note for an unknown one', () => {
    expect(read({ rule: 'quality', code: 'other', note: 'plain note' })).toBe('plain note');
  });
});
