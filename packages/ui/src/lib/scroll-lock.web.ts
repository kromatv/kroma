// Body scroll lock for an open overlay: the page behind a dialog or drawer
// must not scroll under the wheel. Reference-counted, so nested overlays
// release the lock only when the last one closes.

import { useEffect } from 'react';

let holds = 0;
let previous = '';

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;
    if (holds === 0) {
      previous = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    holds += 1;
    return () => {
      holds -= 1;
      if (holds === 0) document.documentElement.style.overflow = previous;
    };
  }, [locked]);
}
