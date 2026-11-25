// @vitest-environment jsdom

import { render, renderHook, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Text } from '#ui/components/atoms/text';
import type { ChangeDetails } from '#ui/lib/control';
import { act as call, snapshot } from '#ui/lib/inspect';
import { onScreen } from '#ui/testing';
import { useSteps } from './use-steps.hook';

const steps = ['account', 'library', 'done'];

const refuse = (_next: string, details: ChangeDetails) => details.cancel();

function Flow() {
  const flow = useSteps(steps);
  return <Text>{flow.value}</Text>;
}

describe('useSteps under its control', () => {
  it('stays on its step when the app cancels the move', () => {
    const { result } = renderHook(() => useSteps(steps, { onValueChange: refuse }));

    act(() => result.current.next());

    expect(result.current.value).toBe('account');
    expect(result.current.reachable('library')).toBe(false);
  });

  it('tells the app the step it was sent to was asked for by name', () => {
    const onValueChange = vi.fn();
    const { result } = renderHook(() => useSteps(steps, { onValueChange }));

    act(() => result.current.goTo('done'));

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith('done', expect.objectContaining({ reason: 'goTo' }));
  });

  it('forgets how far it went when reset on the first step', () => {
    const { result } = renderHook(() => useSteps(steps, { defaultValue: 'done' }));
    act(() => result.current.goTo('account'));

    act(() => result.current.reset());

    expect(result.current.reachable('library')).toBe(false);
  });

  it('is read by a developer tool with its step and the moves open from it', () => {
    render(onScreen(<Flow />));

    const read = snapshot().map(({ name, kind, state, actions }) => ({
      name,
      kind,
      state,
      actions,
    }));

    expect(read).toEqual([
      {
        name: 'steps',
        kind: 'steps',
        state: { value: 'account' },
        actions: ['setValue', 'next', 'goTo'],
      },
    ]);
  });

  it('moves under a developer tool’s call', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', false);
    render(onScreen(<Flow />));

    const report = await call({ steps: [{ ref: 'c1', action: 'next' }] });

    expect(report.controls[0]?.state).toEqual({ value: 'library' });
    expect(screen.getByText('library')).toBeTruthy();
  });
});
