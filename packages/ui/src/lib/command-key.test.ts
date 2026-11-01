// @vitest-environment jsdom

import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandKeyLabel, isCommandKey, onAppleHardware, useCommandKey } from './command-key';

const APPLE = true;
const NOT_APPLE = false;

const LINUX = 'Mozilla/5.0 (X11; Linux x86_64)';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

const CHORD = { key: 'k', ctrlKey: true };

const press = (init: Partial<KeyboardEventInit>) => new KeyboardEvent('keydown', init);

function pretendToBe(userAgent: string): void {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('commandKeyLabel', () => {
  it('spells the chord as an Apple keyboard prints it', () => {
    expect(commandKeyLabel(APPLE)).toBe('⌘K');
  });

  it('spells the chord as any other keyboard prints it', () => {
    expect(commandKeyLabel(NOT_APPLE)).toBe('Ctrl+K');
  });
});

describe('isCommandKey', () => {
  it('is Command+K on Apple hardware', () => {
    expect(isCommandKey(press({ key: 'k', metaKey: true }), APPLE)).toBe(true);
  });

  it('leaves Ctrl+K to the text field on Apple hardware, where it kills the line', () => {
    expect(isCommandKey(press({ key: 'k', ctrlKey: true }), APPLE)).toBe(false);
  });

  it('is Ctrl+K on Windows and Linux', () => {
    expect(isCommandKey(press({ key: 'k', ctrlKey: true }), NOT_APPLE)).toBe(true);
  });

  it('leaves the Windows and Super key alone on Windows and Linux', () => {
    expect(isCommandKey(press({ key: 'k', metaKey: true }), NOT_APPLE)).toBe(false);
  });

  it('holds with caps lock on', () => {
    expect(isCommandKey(press({ key: 'K', ctrlKey: true }), NOT_APPLE)).toBe(true);
  });

  it('ignores the same letter with Shift held', () => {
    expect(isCommandKey(press({ key: 'K', ctrlKey: true, shiftKey: true }), NOT_APPLE)).toBe(false);
  });

  it('ignores AltGr, which Windows reports as Ctrl and Alt together', () => {
    expect(isCommandKey(press({ key: 'k', ctrlKey: true, altKey: true }), NOT_APPLE)).toBe(false);
  });

  it('reads the letter a Dvorak layout types, not the key it sits on', () => {
    expect(isCommandKey(press({ key: 'k', code: 'KeyV', ctrlKey: true }), NOT_APPLE)).toBe(true);
  });

  it('ignores a key that sits on K but types another letter', () => {
    expect(isCommandKey(press({ key: 'v', code: 'KeyK', ctrlKey: true }), NOT_APPLE)).toBe(false);
  });

  it('falls back to the physical key on a layout with no Latin letters', () => {
    expect(isCommandKey(press({ key: 'л', code: 'KeyK', ctrlKey: true }), NOT_APPLE)).toBe(true);
  });

  it('ignores a press with no modifier', () => {
    expect(isCommandKey(press({ key: 'k' }), NOT_APPLE)).toBe(false);
  });
});

describe('onAppleHardware', () => {
  it('is true on a Mac', () => {
    pretendToBe(MAC);

    expect(onAppleHardware()).toBe(true);
  });

  it('is false on Windows', () => {
    pretendToBe(WINDOWS);

    expect(onAppleHardware()).toBe(false);
  });

  it('is false on Linux', () => {
    pretendToBe(LINUX);

    expect(onAppleHardware()).toBe(false);
  });
});

describe('useCommandKey', () => {
  it('hears the chord while a field that stops its keys holds the focus', () => {
    const onPress = vi.fn();
    const field = document.createElement('input');
    document.body.append(field);
    field.addEventListener('keydown', (event) => event.stopPropagation());

    pretendToBe(LINUX);

    renderHook(() => useCommandKey(onPress));
    fireEvent.keyDown(field, CHORD);
    field.remove();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the chord from the browser', () => {
    pretendToBe(LINUX);

    renderHook(() => useCommandKey(vi.fn()));
    const reachedTheBrowser = fireEvent.keyDown(document, CHORD);

    expect(reachedTheBrowser).toBe(false);
  });

  it('fires once while the chord is held, and still keeps it from the browser', () => {
    const onPress = vi.fn();

    pretendToBe(LINUX);

    renderHook(() => useCommandKey(onPress));
    const reachedTheBrowser = fireEvent.keyDown(document, { ...CHORD, repeat: true });

    expect(onPress).not.toHaveBeenCalled();
    expect(reachedTheBrowser).toBe(false);
  });

  it('leaves the chord to the browser while disabled', () => {
    const onPress = vi.fn();

    pretendToBe(LINUX);

    renderHook(() => useCommandKey(onPress, false));
    const reachedTheBrowser = fireEvent.keyDown(document, CHORD);

    expect(onPress).not.toHaveBeenCalled();
    expect(reachedTheBrowser).toBe(true);
  });

  it('stops listening once unmounted', () => {
    const onPress = vi.fn();

    pretendToBe(LINUX);

    const { unmount } = renderHook(() => useCommandKey(onPress));
    unmount();
    fireEvent.keyDown(document, CHORD);

    expect(onPress).not.toHaveBeenCalled();
  });
});
