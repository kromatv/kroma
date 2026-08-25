import { useCallback, useRef } from 'react';
import { WEB } from './platform';

// react-native-web's <Pressable> hard-codes `contain: true` (Pressable/index.js),
// so entering one dispatches a BUBBLING `react-gui:hover:lock` and every ancestor
// Pressable answers it by ending its own hover. A card holding a control would
// therefore go unlit the moment the pointer reached that control. Stopping the
// pair at the node that dispatched them keeps the containment local.
const LOCK = 'react-gui:hover:lock';
const UNLOCK = 'react-gui:hover:unlock';

type Host = { addEventListener?: unknown; removeEventListener?: unknown } | null;

function stop(event: Event) {
  event.stopPropagation();
}

/**
 * Keep this control's hover from cancelling its ancestors'. Returns a ref to put
 * on the host: a CALLBACK ref, not an effect, because <Focusable> swaps its host
 * element when it is disabled, and an effect keyed on the ref object would bind
 * once to whatever the first commit happened to hold.
 *
 * Web-only, and inert everywhere else: React Native has no such event.
 */
export function useHoverPassthrough<T>(): (node: T | null) => void {
  const bound = useRef<EventTarget | null>(null);
  return useCallback((node: T | null) => {
    const previous = bound.current;
    if (previous) {
      previous.removeEventListener(LOCK, stop);
      previous.removeEventListener(UNLOCK, stop);
      bound.current = null;
    }
    if (!WEB) return;
    const host = node as Host;
    if (!host || typeof host.addEventListener !== 'function') return;
    const target = host as unknown as EventTarget;
    target.addEventListener(LOCK, stop);
    target.addEventListener(UNLOCK, stop);
    bound.current = target;
  }, []);
}
