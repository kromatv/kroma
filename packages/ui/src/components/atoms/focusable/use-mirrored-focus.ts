import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import { mirrorFocus } from '#ui/lib/focus-mirror';

/** A navigator control's host ref and focus callback, wired so the document's
 *  focus follows the ring onto its element (see lib/focus-mirror). */
export function useMirroredFocus(
  setBox: (view: View | null) => void,
  onFocus: () => void,
): { ref: (view: View | null) => void; focus: () => void } {
  const host = useRef<View | null>(null);
  const ref = useCallback(
    (view: View | null) => {
      host.current = view;
      setBox(view);
    },
    [setBox],
  );
  const focus = useCallback(() => {
    mirrorFocus(host.current);
    onFocus();
  }, [onFocus]);
  return { ref, focus };
}
