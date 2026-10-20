import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import type { FocusServices } from '#ui/lib/focus-services';

/** A navigator control's host ref and focus callback, wired so the document's
 *  focus follows the ring onto its element (see lib/focus-mirror). */
export function useMirroredFocus(
  setBox: (view: View | null) => void,
  onFocus: () => void,
  mirror: FocusServices['mirror'],
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
    mirror.mirrorFocus(host.current);
    onFocus();
  }, [onFocus, mirror]);
  return { ref, focus };
}
