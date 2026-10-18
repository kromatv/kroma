import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFocusServices } from '#ui/lib/focus-services-context';

/** A ref for a control whose focus is state rather than platform focus: while
 *  `focused`, the document's focus sits on the element it is attached to (see
 *  lib/focus-mirror). */
export function useFocusMirror(focused: boolean): (element: unknown) => void {
  const { mirror } = useFocusServices();
  const host = useRef<unknown>(null);
  useLayoutEffect(() => {
    if (focused) mirror.mirrorFocus(host.current);
  }, [focused, mirror]);
  return useCallback((element: unknown) => {
    host.current = element;
  }, []);
}
