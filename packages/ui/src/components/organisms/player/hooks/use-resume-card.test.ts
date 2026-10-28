// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { useResumeCard } from './use-resume-card';
import type { ResumeNotice } from './use-resume-notice';

function notice(shown = true): ResumeNotice {
  return { shown, secondsLeft: 6, total: 6, dismiss: vi.fn(), holdOpen: vi.fn() };
}

function card(shown = true) {
  const n = notice(shown);
  const onStartOver = vi.fn();
  const view = renderHook(({ current }) => useResumeCard(current, onStartOver), {
    initialProps: { current: n },
  });
  const press = (key: RemoteKey) => {
    let taken = false;
    act(() => {
      taken = view.result.current.onKey(key);
    });
    return taken;
  };
  return { ...view, notice: n, onStartOver, press };
}

describe('useResumeCard', () => {
  it('opens on the button that keeps watching, so OK puts the card away', () => {
    const { result, notice: n, onStartOver, press } = card();

    expect(result.current.focus).toBe('resume');
    expect(press('Enter')).toBe(true);

    expect(n.dismiss).toHaveBeenCalledOnce();
    expect(onStartOver).not.toHaveBeenCalled();
  });

  it('moves to restart on a side press, stops the countdown, and restarts on OK', () => {
    const { result, notice: n, onStartOver, press } = card();

    press('Left');
    press('Enter');

    expect(result.current.focus).toBe('restart');
    expect(n.holdOpen).toHaveBeenCalledOnce();
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it('puts the card away on Back', () => {
    const { notice: n, press } = card();

    expect(press('Back')).toBe(true);

    expect(n.dismiss).toHaveBeenCalledOnce();
  });

  it('leaves up and down to the chrome', () => {
    const { press } = card();

    expect(press('Up')).toBe(false);
    expect(press('Down')).toBe(false);
  });

  it('takes nothing once the card has gone', () => {
    const { press } = card(false);

    expect(press('Enter')).toBe(false);
  });

  it('opens on keep watching again the next time it is shown', () => {
    const { result, rerender, press } = card();
    press('Right');

    rerender({ current: notice(false) });
    rerender({ current: notice(true) });

    expect(result.current.focus).toBe('resume');
  });
});
