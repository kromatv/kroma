// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cutFadesWhileMoving } from './cut-fades-while-moving';

let stop = () => {};
afterEach(() => {
  stop();
  vi.useRealTimers();
});

const moving = () => document.documentElement.hasAttribute('data-kroma-moving');
const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

describe('cutFadesWhileMoving', () => {
  it('marks the document from a key press until the remote has been still a while', () => {
    vi.useFakeTimers();
    stop = cutFadesWhileMoving(window, 400);

    press();
    vi.advanceTimersByTime(300);
    press();
    vi.advanceTimersByTime(300);
    const held = moving();
    vi.advanceTimersByTime(100);

    expect(held).toBe(true);
    expect(moving()).toBe(false);
  });

  it('clears the mark and stops listening when asked', () => {
    stop = cutFadesWhileMoving(window);

    press();
    stop();
    press();

    expect(moving()).toBe(false);
  });
});
