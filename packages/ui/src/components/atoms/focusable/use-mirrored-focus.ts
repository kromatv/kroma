import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import { useFocusServices } from '#ui/lib/focus-services-context';

/** A navigator control's host ref and focus callback, wired so the document's
 *  focus follows the ring onto its element (see lib/focus-mirror). */
export function useMirroredFocus(
  setBox: (view: View | null) => void,
  onFocus: () => void,
): { ref: (view: View | null) => void; focus: () => void } {
  const { mirror } = useFocusServices();
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
