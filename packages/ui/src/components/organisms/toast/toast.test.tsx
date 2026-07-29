// @vitest-environment jsdom
//
// The contract a caller relies on: `toast()` reaches a mounted <Toaster/>, does
// nothing at all when none is mounted (a shell that never opted in must not
// throw from a receiver callback), and the notice leaves on its own - nothing on
// a television is ever going to dismiss it by hand.

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Both the timeout and the exit animation are on fake timers. */
const passTime = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('<Toaster>', () => {
  it('says what a caller anywhere in the app asked it to say', () => {
    render(<Toaster />);
    act(() => toast({ message: 'iPhone connected', detail: 'max' }));
    expect(screen.getAllByText('iPhone connected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('max').length).toBeGreaterThan(0);
  });

  it('takes the notice away again without being asked', () => {
    render(<Toaster />);
    act(() => toast({ message: 'Playing on Salon', duration: 1000 }));
    passTime(1500);
    expect(screen.queryAllByText('Playing on Salon')).toHaveLength(0);
  });

  it('keeps the newest few, so a column of notices is never a wall', () => {
    render(<Toaster />);
    act(() => {
      for (let i = 1; i <= 5; i++) toast({ message: `Notice ${i}` });
    });
    expect(screen.queryAllByText('Notice 1')).toHaveLength(0);
    expect(screen.queryAllByText('Notice 2')).toHaveLength(0);
    expect(screen.getAllByText('Notice 5').length).toBeGreaterThan(0);
  });

  it('is silent, not fatal, with nothing mounted', () => {
    expect(() => toast({ message: 'nobody is listening' })).not.toThrow();
  });
});
