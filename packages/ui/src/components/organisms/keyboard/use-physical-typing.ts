import { useEffect, useEffectEvent } from 'react';
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
  const type = useEffectEvent((key: string) => {
    if (key === 'Backspace') onValueChange(value.slice(0, -1));
    else if (key.length === 1) onValueChange(value + key);
  });

  useEffect(() => {
    const w = physicalKeyboard ? webWindow() : null;
    if (!w) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.key === 'Backspace' || e.key.length === 1) {
        e.preventDefault();
        type(e.key);
      }
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [physicalKeyboard]);

  // Native half of the same idea: an Android TV/emulator bluetooth keyboard has
  // no `document` to listen to, so characters come from the remote bridge
  // instead (a no-op on browser shells, already covered above).
  useHardwareKeys(type);
}

export { usePhysicalTyping };
