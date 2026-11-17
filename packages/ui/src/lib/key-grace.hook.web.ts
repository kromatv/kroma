import { useEffect, useRef } from 'react';
import { webDocument } from './dom';
import { resolveRemoteKey } from './remote-keys';

const KEY_GRACE_MS = 400;

/** Whether the last focus move came from a direction key. Native focus only moves by key. */
export function useKeyGrace(scoped: boolean): () => boolean {
  const keyAt = useRef(0);

  useEffect(() => {
    const dom = webDocument();
    if (!scoped || !dom) {
      return undefined;
    }
    const onKey = (e: KeyboardEvent) => {
      const key = resolveRemoteKey(e);
      if (key === 'Left' || key === 'Right') {
        keyAt.current = Date.now();
      }
    };
    dom.addEventListener('keydown', onKey, true);
    return () => dom.removeEventListener('keydown', onKey, true);
  }, [scoped]);

  return () => Date.now() - keyAt.current <= KEY_GRACE_MS;
}
