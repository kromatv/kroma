// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFormatSummary } from './format-summary';
import type { Condition } from './rules-schemas';

vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  return { useT: () => t };
});

function pattern(value: string, mode: { required: boolean; negate: boolean }): Condition {
  return { type: 'releaseGroup', pattern: value, ...mode };
}

describe('a format summary', () => {
  it('says a format with no conditions has none', () => {
    const { result } = renderHook(() => useFormatSummary());

    expect(result.current([])).toBe('acq.formatNoConditions');
  });

  it('lists required, then optional, then excluded conditions', () => {
    const { result } = renderHook(() => useFormatSummary());

    const text = result.current([
      pattern('C', { required: true, negate: true }),
      pattern('B', { required: false, negate: false }),
      pattern('A', { required: true, negate: false }),
      pattern('A2', { required: true, negate: false }),
    ]);

    expect(text).toBe(
      [
        'acq.summaryRequired {"list":"acq.condition.releaseGroup = A, acq.condition.releaseGroup = A2"}',
        'acq.summaryOptional {"list":"acq.condition.releaseGroup = B"}',
        'acq.summaryExcluded {"list":"acq.condition.releaseGroup = C"}',
      ].join(' '),
    );
  });
});
