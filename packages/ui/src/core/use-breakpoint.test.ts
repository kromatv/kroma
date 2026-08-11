// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { breakpointBits, pinDesignWidth } from '#ui/core/breakpoint';
import { BREAKPOINTS, breakpoint } from '#ui/core/tokens';
import { useBreakpoint, useBreakpointStep } from './use-breakpoint';

afterEach(() => pinDesignWidth());

const at = (width: number) => act(() => pinDesignWidth(width));

const step = (name: 'base' | 'md' | 'lg' | 'tv') => BREAKPOINTS.indexOf(name);

function counted<T>(read: () => T) {
  let renders = 0;
  const view = renderHook(() => {
    renders += 1;
    return read();
  });
  return { ...view, renders: () => renders };
}

describe('useBreakpoint', () => {
  it('names the breakpoint the surface is on', () => {
    pinDesignWidth(breakpoint.lg);
    expect(renderHook(() => useBreakpoint()).result.current).toBe('lg');
  });

  it('follows the surface across a breakpoint', () => {
    pinDesignWidth(0);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toBe('base');
    at(breakpoint.tv);
    expect(result.current).toBe('tv');
  });

  it('re-renders on a crossing and not on a resize inside one step', () => {
    pinDesignWidth(breakpoint.md);
    const { result, renders } = counted(useBreakpoint);
    const settled = renders();

    at(breakpoint.lg - 1);
    expect(renders()).toBe(settled);

    at(breakpoint.lg);
    expect(renders()).toBeGreaterThan(settled);
    expect(result.current).toBe('lg');
  });

  it('stops following once the caller unmounts', () => {
    pinDesignWidth(0);
    const { unmount, renders } = counted(useBreakpoint);
    unmount();
    const settled = renders();
    at(breakpoint.tv);
    expect(renders()).toBe(settled);
  });
});

describe('useBreakpointStep', () => {
  const PX = breakpointBits({ base: 16, lg: 40 });

  it('resolves a declaration at the widest step it names at or below the surface', () => {
    pinDesignWidth(breakpoint.md);
    const { result } = renderHook(() => useBreakpointStep(PX));
    expect(result.current).toBe(step('base'));
    at(breakpoint.lg);
    expect(result.current).toBe(step('lg'));
  });

  it('keys a declaration naming no breakpoint on 0, wherever the surface is', () => {
    pinDesignWidth(0);
    const { result } = renderHook(() => useBreakpointStep(breakpointBits(16)));
    expect(result.current).toBe(0);
    at(breakpoint.tv);
    expect(result.current).toBe(0);
  });

  it('spends no render on a crossing the declaration cannot tell apart', () => {
    pinDesignWidth(0);
    const { renders } = counted(() => useBreakpointStep(PX));
    const settled = renders();

    at(breakpoint.md);
    expect(renders()).toBe(settled);

    at(breakpoint.lg);
    expect(renders()).toBeGreaterThan(settled);
  });
});
