import { beforeEach, describe, expect, it } from 'vitest';
import { createInputTestHost } from '#ui/testing-input';
import { createInputGate } from './input-gate';

const { clearInputHolds, clearPressGuard, holdInput, inputHeld, pressGuardActive } =
  createInputTestHost();

beforeEach(() => {
  clearInputHolds();
  clearPressGuard();
});

describe('input gate', () => {
  it('keeps holds and the release guard within the owning root', () => {
    const first = createInputGate();
    const second = createInputGate();
    const release = first.holdInput();
    expect(first.inputHeld()).toBe(true);
    expect(second.inputHeld()).toBe(false);
    release();
    expect(first.pressGuardActive()).toBe(true);
    expect(second.pressGuardActive()).toBe(false);
    expect(createInputGate().pressGuardActive()).toBe(false);
  });

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
