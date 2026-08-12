import { useCallback, useEffect, useRef } from 'react';
import { webWindow } from '#ui/lib/dom';
import { useHardwareKeys } from '#ui/lib/focus-remote';

// On a hardware keyboard (`physicalKeyboard`, never a real TV shell), typing
// wins over D-pad activation: Space types a space rather than pressing the
// focused key, and a real text input's own events are left alone.
function usePhysicalTyping(
  value: string,
  onValueChange: (next: string) => void,
  physicalKeyboard: boolean,
) {
  const stateRef = useRef({ value, onValueChange });
  stateRef.current = { value, onValueChange };
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
        state.onValueChange(state.value.slice(0, -1));
        return;
      }
      if (e.key.length === 1) {
        e.preventDefault();
        state.onValueChange(state.value + e.key);
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
      if (key === 'Backspace') state.onValueChange(state.value.slice(0, -1));
      else if (key.length === 1) state.onValueChange(state.value + key);
    }, []),
  );
}

export { usePhysicalTyping };
