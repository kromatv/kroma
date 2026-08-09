// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from './toast';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const passTime = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const say = (...messages: string[]) =>
  act(() => {
    for (const message of messages) toast({ message });
  });

// Document order, one entry per notice: every element wrapping a card's text
// matches, and the newest-first / oldest-first question is about the order they
// appear in, not how many nodes each one is.
const stack = () => [
  ...new Set(screen.getAllByText(/^(First|Second|Third)$/).map((el) => el.textContent)),
];

// The absolutely positioned column a notice was drawn into, found by walking up
// from its text rather than by a test hook: what is asserted is the edge it is
// anchored to, which is a fact about the rendered CSS.
function columnOf(message: string): CSSStyleDeclaration {
  let node: HTMLElement | null = screen.getAllByText(message)[0] ?? null;
  while (node) {
    const style = getComputedStyle(node);
    if (style.position === 'absolute' && (style.top !== 'auto' || style.bottom !== 'auto')) {
      return style;
    }
    node = node.parentElement;
  }
  throw new Error(`no toast column for "${message}"`);
}

const anchor = (message: string) => {
  const column = columnOf(message);
  return { top: column.top, bottom: column.bottom, align: column.alignItems };
};

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

  it('caps each corner on its own, so a bottom notice never evicts a top one', () => {
    render(<Toaster position="top-left" />);
    say('First', 'Second', 'Third');
    act(() => {
      toast({ message: 'Elsewhere', position: 'bottom-right' });
    });
    expect(stack()).toEqual(['Third', 'Second', 'First']);
    expect(screen.getAllByText('Elsewhere').length).toBeGreaterThan(0);
  });

  it('is silent, not fatal, with nothing mounted', () => {
    expect(() => toast({ message: 'nobody is listening' })).not.toThrow();
  });

  it('sits top-right at its default, inset 32 from both edges', () => {
    render(<Toaster />);
    act(() => toast({ message: 'iPhone connected' }));
    const column = columnOf('iPhone connected');
    expect(column.top).toBe('32px');
    expect(column.bottom).toBe('auto');
    expect(column.right).toBe('32px');
    expect(column.alignItems).toBe('flex-end');
  });

  it('grows a top column downward, newest against the top edge', () => {
    render(<Toaster position="top-center" />);
    say('First', 'Second', 'Third');
    expect(stack()).toEqual(['Third', 'Second', 'First']);
    expect(anchor('Third')).toEqual({ top: '32px', bottom: 'auto', align: 'center' });
  });

  it('mirrors it at the bottom, newest against the bottom edge', () => {
    render(<Toaster position="bottom-center" />);
    say('First', 'Second', 'Third');
    expect(stack()).toEqual(['First', 'Second', 'Third']);
    expect(anchor('Third')).toEqual({ top: 'auto', bottom: '32px', align: 'center' });
  });

  it('lets one notice name its own corner without moving the rest', () => {
    render(<Toaster position="top-right" />);
    act(() => {
      toast({ message: 'First' });
      toast({ message: 'Second', position: 'bottom-left' });
    });
    expect(anchor('First')).toEqual({ top: '32px', bottom: 'auto', align: 'flex-end' });
    expect(anchor('Second')).toEqual({ top: 'auto', bottom: '32px', align: 'flex-start' });
  });

  it('leaves a notice where it appeared when the host moves under it', () => {
    const { rerender } = render(<Toaster position="top-right" />);
    act(() => toast({ message: 'First' }));
    rerender(<Toaster position="bottom-left" />);
    act(() => toast({ message: 'Second' }));
    expect(anchor('First')).toEqual({ top: '32px', bottom: 'auto', align: 'flex-end' });
    expect(anchor('Second')).toEqual({ top: 'auto', bottom: '32px', align: 'flex-start' });
  });

  it('takes an inset per edge, for a phone whose notch is not its home indicator', () => {
    render(<Toaster position="bottom-center" inset={{ x: 12, top: 59, bottom: 34 }} />);
    act(() => toast({ message: 'First' }));
    const column = columnOf('First');
    expect(column.bottom).toBe('34px');
    expect(column.left).toBe('12px');
    expect(column.right).toBe('12px');
  });
});
