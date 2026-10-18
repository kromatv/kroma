// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GoalFormat, TargetGoal } from './quality-target';
import { useGoalHeadline, useRungLabel, useShortfallText } from './use-goal-text';

vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  return { useT: () => t };
});

const VFF: GoalFormat = { id: 'vff', name: 'VFF' };
const HDR: GoalFormat = { id: 'hdr', name: 'HDR' };

function goal(over: Partial<TargetGoal>): TargetGoal {
  return {
    kind: 'target',
    rung: { kind: 'quality', quality: 'webdl-1080p' },
    formats: { kind: 'none' },
    tiers: [],
    cutoffTier: 0,
    need: 0,
    ...over,
  };
}

describe('a rung label', () => {
  it('writes each way a rung is named', () => {
    const { result } = renderHook(() => useRungLabel());

    expect(result.current({ kind: 'named', name: 'Best' })).toBe('Best');
    expect(result.current({ kind: 'quality', quality: 'webdl-1080p' })).toBe('WEB-DL 1080p');
    expect(result.current({ kind: 'resolution', resolution: '1080p' })).toBe('1080p');
    expect(result.current({ kind: 'qualities', qualities: ['webdl-1080p', 'bluray-1080p'] })).toBe(
      'WEB-DL 1080p / Blu-ray 1080p',
    );
  });
});

describe('a goal headline', () => {
  it('is the bare quality when no format is asked for', () => {
    const { result } = renderHook(() => useGoalHeadline());

    expect(result.current(goal({}))).toBe('WEB-DL 1080p');
  });

  it('adds the score when the goal is a bare score', () => {
    const { result } = renderHook(() => useGoalHeadline());

    expect(result.current(goal({ formats: { kind: 'score', score: 150 } }))).toBe(
      'acq.goal.withScore {"quality":"WEB-DL 1080p","score":150}',
    );
  });

  it('names one format', () => {
    const { result } = renderHook(() => useGoalHeadline());

    expect(result.current(goal({ formats: { kind: 'one', format: VFF } }))).toBe(
      'acq.goal.withFormats {"quality":"WEB-DL 1080p","formats":"VFF"}',
    );
  });

  it('joins two formats as either or both', () => {
    const { result } = renderHook(() => useGoalHeadline());

    expect(result.current(goal({ formats: { kind: 'either', formats: [VFF, HDR] } }))).toContain(
      'acq.goal.either {\\"first\\":\\"VFF\\",\\"second\\":\\"HDR\\"}',
    );
    expect(result.current(goal({ formats: { kind: 'both', formats: [VFF, HDR] } }))).toContain(
      'acq.goal.both',
    );
  });
});

describe('a shortfall text', () => {
  const target = goal({ rung: { kind: 'resolution', resolution: '1080p' } });

  it('says a refused quality', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(result.current({ kind: 'refused', quality: 'cam' }, target)).toBe(
      'acq.short.refused {"quality":"CAM"}',
    );
  });

  it('names a lower file by resolution when the rung is named by one', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(
      result.current({ kind: 'lower', quality: 'webdl-720p', byResolution: true }, target),
    ).toBe('acq.short.lower {"have":"720p","goal":"1080p"}');
  });

  it('names a lower file by its quality otherwise', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(
      result.current({ kind: 'lower', quality: 'webdl-720p', byResolution: false }, target),
    ).toBe('acq.short.lower {"have":"WEB-DL 720p","goal":"1080p"}');
  });

  it('says a ranked quality', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(result.current({ kind: 'ranked', quality: 'webdl-720p' }, target)).toBe(
      'acq.short.ranked {"quality":"WEB-DL 720p"}',
    );
  });

  it('chains the missing formats with nor', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(result.current({ kind: 'missing', formats: [VFF, HDR] }, target)).toBe(
      'acq.short.missing {"formats":"acq.short.nor {\\"first\\":\\"VFF\\",\\"second\\":\\"HDR\\"}"}',
    );
    expect(result.current({ kind: 'missing', formats: [VFF] }, target)).toContain(
      '"formats":"VFF"',
    );
    expect(result.current({ kind: 'missing', formats: [] }, target)).toContain('"formats":""');
  });

  it('says a score shortfall', () => {
    const { result } = renderHook(() => useShortfallText());

    expect(result.current({ kind: 'score', score: 10, need: 50 }, target)).toBe(
      'acq.short.score {"score":10,"need":50}',
    );
  });
});
