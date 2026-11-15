import { useCallback, useSyncExternalStore } from 'react';
import { liveState, onLiveChange } from '../live';
import { engine } from './engine';

/** The locale every message is rendered in right now: the override while one
 *  is set, and the one the app resolved for itself otherwise. */
export function renderedLocale(): string {
  return liveState().locale ?? engine().activeLocale();
}

/** {@link renderedLocale}, kept current through an override and through an
 *  engine that settles its own locale after the tools mount. */
export function useRenderedLocale(): string {
  const subscribe = useCallback((listener: () => void) => {
    const stopEngine = engine().subscribe?.(listener);
    const stopLive = onLiveChange(listener);
    return () => {
      stopEngine?.();
      stopLive();
    };
  }, []);
  return useSyncExternalStore(subscribe, renderedLocale, renderedLocale);
}
