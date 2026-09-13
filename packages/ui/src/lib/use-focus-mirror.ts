import { useCallback, useLayoutEffect, useRef } from 'react';
import { mirrorFocus } from './focus-mirror';

/** A ref for a control whose focus is state rather than platform focus: while
 *  `focused`, the document's focus sits on the element it is attached to (see
 *  lib/focus-mirror). */
export function useFocusMirror(focused: boolean): (element: unknown) => void {
  const host = useRef<unknown>(null);
  useLayoutEffect(() => {
    if (focused) mirrorFocus(host.current);
  }, [focused]);
  return useCallback((element: unknown) => {
    host.current = element;
  }, []);
}
