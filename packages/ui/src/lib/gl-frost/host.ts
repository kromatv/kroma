import type { FrostLayer } from './context';

/** The frost layers drawn now, for frosted surfaces outside any `<FrostSource>`
 *  (an app's persistent chrome): they use the newest. */
export interface FrostHost {
  current(): FrostLayer | null;
  subscribe(listener: () => void): () => void;
  /** Offers `layer` until the returned call. */
  offer(layer: FrostLayer): () => void;
}

export function createFrostHost(): FrostHost {
  const layers: FrostLayer[] = [];
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return {
    current: () => layers.at(-1) ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    offer(layer) {
      layers.push(layer);
      changed();
      return () => {
        const at = layers.lastIndexOf(layer);
        if (at >= 0) layers.splice(at, 1);
        changed();
      };
    },
  };
}
