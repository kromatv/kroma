// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { armEscapeGuard } from './escape-guard';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  // A guard armed by a test that never pressed Escape is still on `document`;
  // its own disarm timeout is what takes it off, so run that before handing
  // the next test a clean one.
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

// The listener the guard is protecting: react-native-web's <Modal> closes on a
// document Escape keyup in the BUBBLE phase, so a capture-phase
// stopImmediatePropagation is what keeps the press from reaching it.
function modalCloseSpy() {
  const closed = vi.fn();
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closed();
  };
  document.addEventListener('keyup', onKeyUp);
  return { closed, dispose: () => document.removeEventListener('keyup', onKeyUp) };
}

function escapeUp() {
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
}

describe('the escape guard', () => {
  it('swallows the keyup paired with the press that armed it', () => {
    const modal = modalCloseSpy();
    armEscapeGuard();
    escapeUp();
    expect(modal.closed).not.toHaveBeenCalled();
    modal.dispose();
  });

  it('swallows exactly one, so the next Escape closes the dialog', () => {
    const modal = modalCloseSpy();
    armEscapeGuard();
    escapeUp();
    escapeUp();
    expect(modal.closed).toHaveBeenCalledTimes(1);
    modal.dispose();
  });

  it('lets every other key through while it is armed', () => {
    const seen: string[] = [];
    const onKeyUp = (event: KeyboardEvent) => seen.push(event.key);
    document.addEventListener('keyup', onKeyUp);
    armEscapeGuard();
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', bubbles: true }));
    expect(seen).toEqual(['Enter', 'a']);
    document.removeEventListener('keyup', onKeyUp);
  });

  it('disarms itself after a second, so an abandoned press eats nothing later', () => {
    // The window can lose focus between keydown and keyup; the keyup never
    // arrives, and a guard left armed would swallow an unrelated Escape.
    const modal = modalCloseSpy();
    armEscapeGuard();
    vi.advanceTimersByTime(1000);
    escapeUp();
    expect(modal.closed).toHaveBeenCalledTimes(1);
    modal.dispose();
  });

  it('is still armed just under the timeout', () => {
    const modal = modalCloseSpy();
    armEscapeGuard();
    vi.advanceTimersByTime(999);
    escapeUp();
    expect(modal.closed).not.toHaveBeenCalled();
    modal.dispose();
  });

  it('is a no-op on a target with no document to guard', () => {
    vi.stubGlobal('document', undefined);
    expect(() => armEscapeGuard()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
