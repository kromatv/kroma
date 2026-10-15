import { useCallback } from 'react';
import type { View } from 'react-native';
import { useRevealWhenFocused } from './focus-scroll';
import { useFocusMirror } from './use-focus-mirror';

/** The host ref of a row whose focus is a prop rather than the platform's (a
 *  player panel's rows): while `focused`, the document's focus sits on it (see
 *  lib/focus-mirror) and the page it scrolls in shows it whole. */
export function useFocusedRow(focused: boolean): (view: View | null) => void {
  const mirror = useFocusMirror(focused);
  const anchor = useRevealWhenFocused(focused);
  return useCallback(
    (view: View | null) => {
      mirror(view);
      anchor.current = view;
    },
    [mirror, anchor],
  );
}
