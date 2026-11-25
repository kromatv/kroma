// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHeadingWidths } from './table-heading-widths.hook';

describe('useHeadingWidths', () => {
  it('keeps a whole pixel more than a heading measured, and nothing for the columns before it', () => {
    const { result } = renderHook(() => useHeadingWidths());

    act(() => result.current.fit(1, 50.2));

    expect(result.current.headings).toEqual([0, 52]);
  });

  it('keeps the same list when a heading measures what it did', () => {
    const { result } = renderHook(() => useHeadingWidths());
    act(() => result.current.fit(0, 40));
    const before = result.current.headings;

    act(() => result.current.fit(0, 40));

    expect(result.current.headings).toBe(before);
  });

  it('needs nothing for a heading that measures nothing', () => {
    const { result } = renderHook(() => useHeadingWidths());
    act(() => result.current.fit(0, 40));

    act(() => result.current.fit(0, 0));

    expect(result.current.headings).toEqual([0]);
  });
});
