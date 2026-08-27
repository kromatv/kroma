// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSteps } from './use-steps';

const steps = ['account', 'library', 'done'];

describe('useSteps with steps nothing may enter', () => {
  it('steps over a barred step on the way forward', () => {
    const { result } = renderHook(() => useSteps(steps, { disabled: ['library'] }));

    act(() => result.current.next());

    expect(result.current.value).toBe('done');
  });

  it('steps over a barred step on the way back', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() =>
      useSteps(steps, { defaultValue: 'done', disabled: ['library'], onValueChange }),
    );

    act(() => result.current.previous());

    expect(onValueChange).toHaveBeenCalledWith('account', { reason: 'previous' });
    expect(result.current.value).toBe('account');
  });

  it('refuses to go to a barred step, and calls it unreachable', () => {
    const { result } = renderHook(() => useSteps(steps, { disabled: ['library'] }));

    act(() => result.current.goTo('library'));

    expect(result.current.value).toBe('account');
    expect(result.current.reachable('library')).toBe(false);
  });

  it('has nowhere left to go when every step ahead is barred', () => {
    const { result } = renderHook(() => useSteps(steps, { disabled: ['library', 'done'] }));

    expect(result.current.canGoNext).toBe(false);
  });
});

describe('useSteps when its owner says which steps are done', () => {
  it('takes that word rather than counting how far the flow went', () => {
    const { result } = renderHook(() => useSteps(steps, { complete: ['done'] }));

    act(() => result.current.next());

    expect(result.current.complete('done')).toBe(true);
    expect(result.current.complete('account')).toBe(false);
  });

  it('opens the step showing and the ones it was told are done, and no others', () => {
    const { result } = renderHook(() => useSteps(steps, { complete: ['done'] }));

    expect(result.current.reachable('account')).toBe(true);
    expect(result.current.reachable('done')).toBe(true);
    expect(result.current.reachable('library')).toBe(false);
  });

  it('re-reads which steps are done when its owner changes them', () => {
    const { result, rerender } = renderHook(({ complete }) => useSteps(steps, { complete }), {
      initialProps: { complete: [] as readonly string[] },
    });

    rerender({ complete: ['account'] });

    expect(result.current.complete('account')).toBe(true);
    expect(result.current.reachable('library')).toBe(false);
  });
});
