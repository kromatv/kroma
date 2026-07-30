// A typed, in-process event bus between modules. Modules declare their events by
// merging into `KromaEvents` (see contracts.ts).

import type { KromaEvents } from './contracts';

export type EventKey = Extract<keyof KromaEvents, string>;

export interface EventBus {
  emit<K extends EventKey>(key: K, payload: KromaEvents[K]): void;
  on<K extends EventKey>(key: K, handler: (payload: KromaEvents[K]) => void): () => void;
}

type AnyHandler = (payload: never) => void;

/** Dispatch is synchronous: `emit` returns once every handler has run. */
export function createEventBus(): EventBus {
  const handlers = new Map<string, Set<AnyHandler>>();
  return {
    emit(key, payload) {
      const set = handlers.get(key);
      if (!set) return;
      // A handler may (un)subscribe during dispatch; every handler subscribed
      // when emit began still fires exactly once.
      const snapshot = Array.from(set);
      for (const handler of snapshot) (handler as (p: typeof payload) => void)(payload);
    },
    on(key, handler) {
      const set = handlers.get(key) ?? new Set<AnyHandler>();
      set.add(handler as AnyHandler);
      handlers.set(key, set);
      return () => {
        set.delete(handler as AnyHandler);
      };
    },
  };
}
