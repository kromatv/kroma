import { beforeEach, describe, expect, it } from 'vitest';
import { clearInputHolds, holdInput, inputHeld } from './input-gate';
import { clearPressGuard, pressGuardActive } from './press-guard';

beforeEach(() => {
  clearInputHolds();
  clearPressGuard();
});

describe('input gate', () => {
  it('is open until an overlay takes the remote', () => {
    expect(inputHeld()).toBe(false);
    const release = holdInput();
    expect(inputHeld()).toBe(true);
    release();
    expect(inputHeld()).toBe(false);
  });

  it('stays held until the LAST overlay releases', () => {
    const first = holdInput();
    const second = holdInput();
    first();
    expect(inputHeld()).toBe(true);
    second();
    expect(inputHeld()).toBe(false);
  });

  it('ignores a release that already ran (React cleanups run twice)', () => {
    const release = holdInput();
    const other = holdInput();
    release();
    release();
    expect(inputHeld()).toBe(true);
    other();
    expect(inputHeld()).toBe(false);
  });

  it('arms the press guard on the way out, so the button that ended the overlay does not land', () => {
    const release = holdInput();
    expect(pressGuardActive()).toBe(false);
    release();
    expect(pressGuardActive()).toBe(true);
  });
});
