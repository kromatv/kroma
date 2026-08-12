// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePhysicalTyping } from './use-physical-typing';

// The native half never touches a document: characters arrive from the remote
// bridge, whose own delivery is pinned in `lib/focus-remote`.
const bridge = vi.hoisted(() => ({ send: null as ((key: string) => void) | null }));

vi.mock('#ui/lib/focus-remote', () => ({
  useHardwareKeys: (handle: (key: string) => void) => {
    bridge.send = handle;
  },
}));

afterEach(() => {
  bridge.send = null;
  document.body.replaceChildren();
});

function typing(physicalKeyboard = true) {
  return renderHook(() => {
    const [value, setValue] = useState('');
    usePhysicalTyping(value, setValue, physicalKeyboard);
    return value;
  });
}

function press(init: KeyboardEventInit, on: EventTarget = window) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => void on.dispatchEvent(event));
  return event;
}

const field = (tag: 'input' | 'textarea') => document.body.appendChild(document.createElement(tag));

describe('typing on a hardware keyboard', () => {
  it('collects the characters, in the order they were struck', () => {
    const { result } = typing();
    for (const key of ['k', 'r', 'o']) press({ key });
    expect(result.current).toBe('kro');
  });

  it('types a space instead of pressing the key the remote is on', () => {
    const { result } = typing();
    const event = press({ key: ' ' });
    expect(result.current).toBe(' ');
    expect(event.defaultPrevented).toBe(true);
  });

  it('deletes the last character on Backspace, and leaves the page where it is', () => {
    const { result } = typing();
    press({ key: 'k' });
    press({ key: 'o' });
    const event = press({ key: 'Backspace' });
    expect(result.current).toBe('k');
    expect(event.defaultPrevented).toBe(true);
  });

  it('has nothing left to delete on an empty value', () => {
    const { result } = typing();
    press({ key: 'Backspace' });
    expect(result.current).toBe('');
  });

  it('leaves a named key to whoever else wants it', () => {
    const { result } = typing();
    for (const key of ['ArrowLeft', 'Enter', 'Shift', 'F5', 'Escape']) {
      expect(press({ key }).defaultPrevented, key).toBe(false);
    }
    expect(result.current).toBe('');
  });

  it('leaves a shortcut alone, so the browser still hears it', () => {
    const { result } = typing();
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(press({ key: 'r', ...init }).defaultPrevented).toBe(false);
    }
    expect(result.current).toBe('');
  });

  it('leaves a keystroke the IME is still composing to the IME', () => {
    const { result } = typing();
    press({ key: 'a', isComposing: true });
    expect(result.current).toBe('');
  });

  it('leaves a real text field to type into itself', () => {
    const { result } = typing();
    press({ key: 'a' }, field('input'));
    press({ key: 'b' }, field('textarea'));
    expect(result.current).toBe('');
  });

  it('hears nothing on a shell with no hardware keyboard', () => {
    const { result } = typing(false);
    press({ key: 'k' });
    expect(result.current).toBe('');
  });

  it('starts hearing the keyboard the moment the shell reports one', () => {
    const { result, rerender } = renderHook(
      ({ physical }) => {
        const [value, setValue] = useState('');
        usePhysicalTyping(value, setValue, physical);
        return value;
      },
      { initialProps: { physical: false } },
    );
    press({ key: 'k' });
    rerender({ physical: true });
    press({ key: 'o' });
    expect(result.current).toBe('o');
  });

  it('stops listening once the keyboard is gone', () => {
    const { result, unmount } = typing();
    press({ key: 'k' });
    unmount();
    press({ key: 'o' });
    expect(result.current).toBe('k');
  });
});

describe('typing through the remote bridge', () => {
  it('collects a character the bridge delivers, with no document in sight', () => {
    const { result } = typing(false);
    act(() => bridge.send?.('k'));
    act(() => bridge.send?.('o'));
    expect(result.current).toBe('ko');
  });

  it('deletes the last character on Backspace', () => {
    const { result } = typing(false);
    act(() => bridge.send?.('k'));
    act(() => bridge.send?.('Backspace'));
    expect(result.current).toBe('');
  });

  it('ignores anything that is not one character', () => {
    const { result } = typing(false);
    act(() => bridge.send?.('Shift'));
    expect(result.current).toBe('');
  });
});
