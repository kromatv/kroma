import { useSyncExternalStore } from 'react';
import { labelOf, type Origin, onOriginTraced, sourceOrigin } from './origin';

/** Where a string is written, traced back through the transforms between the
 *  file and the browser as soon as the dev server says where that is. */
export function useOrigin(origin: Origin | null): { label: string; file: string } | null {
  const traced = useSyncExternalStore(
    onOriginTraced,
    () => (origin ? sourceOrigin(origin) : null),
    () => origin,
  );
  if (!traced) return null;
  return { label: labelOf(traced), file: `${traced.file}:${traced.line}:${traced.column}` };
}
