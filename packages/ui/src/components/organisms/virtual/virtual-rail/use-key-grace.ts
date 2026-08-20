import { type RefObject, useEffect, useRef } from 'react';
import { webDocument } from '#ui/lib/dom';
import { WEB } from '#ui/lib/platform';

const KEY_GRACE_MS = 400;

const DIRECTIONS = new Set(['ArrowLeft', 'ArrowRight', 'Left', 'Right']);

/** When a direction key was last pressed, so a row can tell a keyed focus move
 *  from one a wandering pointer caused. */
function useKeyGrace(scoped: boolean): RefObject<number> {
  const keyAt = useRef(0);

  // Capture phase: react-native-web's TextInput stops propagation on keydown, so
  // a bubbling listener would miss every press made while a field holds focus.
  useEffect(() => {
    const dom = webDocument();
    if (!WEB || !scoped || !dom) return;
    const onKey = (e: KeyboardEvent) => {
      if (DIRECTIONS.has(e.key)) keyAt.current = Date.now();
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [scoped]);

  return keyAt;
}

export { KEY_GRACE_MS, useKeyGrace };
