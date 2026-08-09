// <OnScreenKeyboard>: the two remote-driven keyboards, a full layout for
// server URLs and a dedicated search layout. Every key is a <Focusable>, so
// the spatial focus nav reaches it and OK activates it.
//
// The letter order is the CALLER's (a device preference on the TV, see its
// keyboardLayoutPref): a keyboard that read a store would tie the kit to one
// app's settings.

import { useCallback, useEffect, useRef } from 'react';
import { webWindow } from '#ui/lib/dom';
import { useHardwareKeys } from '#ui/lib/focus-remote';
import type { KeyboardSize } from './key';
import type { KeyboardLayout } from './keyboard-layouts';
import { SearchKeyboard } from './search-keyboard';
import { UrlKeyboard } from './url-keyboard';

// On a hardware keyboard (`physicalKeyboard`, never a real TV shell), typing
// wins over D-pad activation: Space types a space rather than pressing the
// focused key, and a real text input's own events are left alone.
function usePhysicalTyping(
  value: string,
  onChange: (next: string) => void,
  physicalKeyboard: boolean,
) {
  const stateRef = useRef({ value, onChange });
  stateRef.current = { value, onChange };
  useEffect(() => {
    const w = physicalKeyboard ? webWindow() : null;
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const state = stateRef.current;
      if (e.key === 'Backspace') {
        e.preventDefault();
        state.onChange(state.value.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        state.onChange(state.value + e.key);
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [physicalKeyboard]);

  // Native half of the same idea: an Android TV/emulator bluetooth keyboard has
  // no `document` to listen to, so characters come from the remote bridge
  // instead (a no-op on browser shells, already covered above).
  useHardwareKeys(
    useCallback((key: string) => {
      const state = stateRef.current;
      if (key === 'Backspace') state.onChange(state.value.slice(0, -1));
      else if (key.length === 1) state.onChange(state.value + key);
    }, []),
  );
}

interface OnScreenKeyboardProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  /** Which keyboard: the server-URL grid or the search grid. */
  layout?: 'url' | 'search';
  submitLabel?: string;
  /** Letter order. Defaults to the alphabetical TV grid. */
  letters?: KeyboardLayout;
  /** Whether a real keyboard is attached, so typing bypasses the keys. Never
   *  true on a TV shell; a browser workbench passes it. */
  physicalKeyboard?: boolean;
  /** The key scale: `sm` for arm's length, `tv` for across a room. */
  size?: KeyboardSize;
}

/** The caller owns the text value; each key mutates it through `onChange`, and
 * the special keys (space / delete / clear / submit / close) call the matching
 * handler. */
function OnScreenKeyboard({
  value,
  onChange,
  onSubmit,
  onClose,
  layout = 'search',
  submitLabel,
  letters = 'abc',
  physicalKeyboard = false,
  size = 'sm',
}: Readonly<OnScreenKeyboardProps>) {
  usePhysicalTyping(value, onChange, physicalKeyboard);

  return layout === 'search' ? (
    <SearchKeyboard
      value={value}
      onChange={onChange}
      onClose={onClose}
      layout={letters}
      size={size}
    />
  ) : (
    <UrlKeyboard
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      submitLabel={submitLabel}
      layout={letters}
      size={size}
    />
  );
}

export type { OnScreenKeyboardProps };
export { OnScreenKeyboard };
