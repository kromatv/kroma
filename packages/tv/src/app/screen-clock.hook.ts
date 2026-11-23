import { monotonicNow as clock } from '@kromatv/client';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';

/** Times each screen from the navigation that asked for it to the commit that
 *  shows it, and hands the result to `onScreen` under the screen's name. A
 *  new screen object is a new navigation; the first is timed from the app's
 *  start. Returns the mark a navigation calls before it changes the stack. */
export function useScreenClock(
  screen: { readonly name: string },
  onScreen?: (name: string, ms: number) => void,
): () => void {
  const askedAt = useRef(clock());
  const shown = useEffectEvent((name: string) => {
    onScreen?.(`tv ${name}`, clock() - askedAt.current);
  });
  useEffect(() => {
    shown(screen.name);
  }, [screen]);
  return useCallback(() => {
    askedAt.current = clock();
  }, []);
}
