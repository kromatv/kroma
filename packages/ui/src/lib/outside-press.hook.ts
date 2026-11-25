import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import { webWindow } from '#ui/lib/dom';

interface OutsidePressAt {
  within: RefObject<unknown> | undefined;
  listId: string;
  onOutside: () => void;
}

/**
 * Hears a press that lands outside a popup (found by its `listId`) and outside
 * the node it hangs off, and leaves every press to the page: a field under its
 * own suggestions takes its clicks as if the popup were not there. Browser
 * targets only. It answers whether it is listening, so a caller on a target
 * that cannot tell keeps a backdrop.
 */
export function useOutsidePress(at: OutsidePressAt): boolean {
  const win = webWindow();
  const { within, listId } = at;
  const live = useRef(at);
  useLayoutEffect(() => {
    live.current = at;
  });
  useEffect(() => {
    if (!win || !within) {
      return undefined;
    }
    const onDown = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      const holds = (node: unknown) => node instanceof Node && node.contains(target);
      if (!holds(win.document.getElementById(listId)) && !holds(within.current)) {
        live.current.onOutside();
      }
    };
    win.addEventListener('pointerdown', onDown, true);
    return () => win.removeEventListener('pointerdown', onDown, true);
  }, [win, within, listId]);
  return win !== null && within !== undefined;
}
