// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type Anchor, PageScrollContext, RailScrollContext, RowContext } from './reveal-contexts';
import { useRevealOnFocusBy, useRevealWhenFocused } from './use-reveal-on-focus';

function setup() {
  const page = vi.fn();
  const rail = vi.fn();
  const row: Anchor = { current: null };
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      PageScrollContext.Provider,
      { value: page },
      createElement(
        RailScrollContext.Provider,
        { value: rail },
        createElement(RowContext.Provider, { value: row }, children),
      ),
    );
  return { page, rail, row, wrapper };
}

describe('useRevealOnFocusBy', () => {
  it('asks the rail for the control and the page for its row', () => {
    const { page, rail, row, wrapper } = setup();
    const self: Anchor = { current: null };
    const { result } = renderHook(() => useRevealOnFocusBy(self, () => false), { wrapper });

    result.current();

    expect(rail).toHaveBeenCalledWith(self);
    expect(page).toHaveBeenCalledWith(row);
  });

  it('reveals nothing while the pointer drives', () => {
    const { page, rail, wrapper } = setup();
    const { result } = renderHook(() => useRevealOnFocusBy({ current: null }, () => true), {
      wrapper,
    });

    result.current();

    expect(page).not.toHaveBeenCalled();
    expect(rail).not.toHaveBeenCalled();
  });

  it('asks the page for the control itself when it is in no row', () => {
    const page = vi.fn();
    const self: Anchor = { current: null };
    const { result } = renderHook(() => useRevealOnFocusBy(self, () => false), {
      wrapper: ({ children }) =>
        createElement(PageScrollContext.Provider, { value: page }, children),
    });

    result.current();

    expect(page).toHaveBeenCalledWith(self);
  });
});

describe('useRevealWhenFocused', () => {
  it('reveals once focused turns true', () => {
    const { page, wrapper } = setup();
    const { rerender } = renderHook(({ focused }) => useRevealWhenFocused(focused), {
      wrapper,
      initialProps: { focused: false },
    });

    rerender({ focused: true });

    expect(page).toHaveBeenCalledTimes(1);
  });
});
