// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSteps } from './use-steps';

describe('useSteps', () => {
  const steps = ['account', 'library', 'done'];

  it('opens on the first step with nowhere to go back to', () => {
    const { result } = renderHook(() => useSteps(steps));

    expect(result.current).toMatchObject({ value: 'account', index: 0, count: 3, first: true });
    expect(result.current.canGoPrevious).toBe(false);
    expect(result.current.canGoNext).toBe(true);
  });

  it('opens every step it has been past, and none of the ones ahead', () => {
    const { result } = renderHook(() => useSteps(steps));

    act(() => result.current.next());

    expect(result.current.complete('account')).toBe(true);
    expect(result.current.reachable('account')).toBe(true);
    expect(result.current.reachable('done')).toBe(false);
  });

  it('goes to a step ahead when its owner says so, rather than the indicator', () => {
    const { result } = renderHook(() => useSteps(steps));

    act(() => result.current.goTo('done'));

    expect(result.current.value).toBe('done');
    expect(result.current.reachable('library')).toBe(true);
  });

  it('goes back to the first step and forgets how far it went', () => {
    const { result } = renderHook(() => useSteps(steps));

    act(() => result.current.goTo('done'));
    act(() => result.current.reset());

    expect(result.current.value).toBe('account');
    expect(result.current.reachable('library')).toBe(false);
  });

  it('keeps one identity for every callback a caller may depend on', () => {
    const { result, rerender } = renderHook(() => useSteps(steps));
    const first = result.current;

    act(() => result.current.next());
    rerender();

    expect(result.current.next).toBe(first.next);
    expect(result.current.previous).toBe(first.previous);
    expect(result.current.goTo).toBe(first.goTo);
    expect(result.current.reset).toBe(first.reset);
  });

  it('knows when it is on the last step, with nowhere further to go', () => {
    const { result } = renderHook(() => useSteps(steps, { defaultValue: 'done' }));

    expect(result.current).toMatchObject({ last: true, index: 2 });
    expect(result.current.canGoNext).toBe(false);
  });

  it('holds nothing and goes nowhere when it is handed no steps', () => {
    const { result } = renderHook(() => useSteps([]));

    expect(result.current).toMatchObject({ value: '', count: 0, index: 0 });
    expect(result.current.canGoNext).toBe(false);
  });

  it('falls back to the first step when the value it is handed is not one of them', () => {
    const { result } = renderHook(() => useSteps(steps, { value: 'elsewhere' }));

    expect(result.current).toMatchObject({ value: 'account', index: 0 });
  });

  it('stays where it is, and says nothing, when sent to the step already showing', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useSteps(steps, { onValueChange }));

    act(() => result.current.goTo('account'));

    expect(result.current.value).toBe('account');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('ignores a step it does not hold', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useSteps(steps, { onValueChange }));

    act(() => result.current.goTo('elsewhere'));

    expect(result.current.value).toBe('account');
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('reports where it would go without moving when its owner holds the value', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useSteps(steps, { value: 'account', onValueChange }));

    act(() => result.current.next());

    expect(onValueChange).toHaveBeenCalledWith('library', { reason: 'next' });
    expect(result.current.value).toBe('account');
  });

  it('keeps the steps a controlled value opened once it comes back', () => {
    const { result, rerender } = renderHook(({ value }) => useSteps(steps, { value }), {
      initialProps: { value: 'account' },
    });

    rerender({ value: 'done' });
    rerender({ value: 'account' });

    expect(result.current.value).toBe('account');
    expect(result.current.reachable('library')).toBe(true);
  });

  it('says it was reset when the flow goes back to the start', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useSteps(steps, { defaultValue: 'done', onValueChange }));

    act(() => result.current.reset());

    expect(onValueChange).toHaveBeenCalledWith('account', { reason: 'reset' });
    expect(result.current.value).toBe('account');
  });
});
