import { useCallback, useLayoutEffect, useRef } from 'react';
import { useFocusServices } from '#ui/lib/focus-services-context';

/** A ref for a control whose focus is state rather than platform focus: while
 *  `focused`, the document's focus sits on the element it is attached to (see
 *  lib/focus-mirror). */
export function useFocusMirror(focused: boolean): (element: unknown) => void {
  const { mirror, holder } = useFocusServices();
  const host = useRef<unknown>(null);
  useLayoutEffect(() => {
    if (!focused) {
      return undefined;
    }
    const view = host.current;
    mirror.mirrorFocus(view);
    holder.hold(view);
    return () => holder.drop(view);
  }, [focused, mirror, holder]);
  return useCallback((element: unknown) => {
    host.current = element;
  }, []);
}
