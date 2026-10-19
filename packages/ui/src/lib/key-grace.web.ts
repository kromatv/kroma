import { useEffect, useRef } from 'react';
import { webDocument } from './dom';

const KEY_GRACE_MS = 400;

const DIRECTIONS = new Set(['ArrowLeft', 'ArrowRight', 'Left', 'Right']);

/** Whether the last focus move came from a direction key. Native focus only moves by key. */
export function useKeyGrace(scoped: boolean): () => boolean {
  const keyAt = useRef(0);

  useEffect(() => {
    const dom = webDocument();
    if (!scoped || !dom) return;
    const onKey = (e: KeyboardEvent) => {
      if (DIRECTIONS.has(e.key)) keyAt.current = Date.now();
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [scoped]);

  return () => Date.now() - keyAt.current <= KEY_GRACE_MS;
}
