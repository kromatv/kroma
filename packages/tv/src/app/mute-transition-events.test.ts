// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { muteTransitionEvents } from './mute-transition-events';

let unmute = () => {};
afterEach(() => unmute());

describe('muteTransitionEvents', () => {
  it('keeps transition events from reaching anything below the window', () => {
    const heard = vi.fn();
    document.addEventListener('transitionend', heard);
    document.body.addEventListener('transitionrun', heard);
    unmute = muteTransitionEvents(window);

    document.body.dispatchEvent(new Event('transitionend', { bubbles: true }));
    document.body.dispatchEvent(new Event('transitionrun', { bubbles: true }));

    expect(heard).not.toHaveBeenCalled();
  });

  it('leaves every other event alone, and lets go when asked', () => {
    const heard = vi.fn();
    document.addEventListener('keydown', heard);
    document.addEventListener('transitionend', heard);
    unmute = muteTransitionEvents(window);

    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    unmute();
    document.body.dispatchEvent(new Event('transitionend', { bubbles: true }));

    expect(heard).toHaveBeenCalledTimes(2);
  });
});
