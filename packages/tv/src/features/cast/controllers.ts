import type { CastClientMessage, CastController, ControllerId } from '@kromatv/client/cast';
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';

// Shared and frozen, so `useSyncExternalStore` doesn't see a new array every
// read and loop.
const NOBODY: readonly CastController[] = Object.freeze([]);

// Not the controller id: that belongs to a socket, so a phone that reconnects
// arrives under a new one and would be announced again.
function who(controller: CastController): string {
  return `${controller.username}\u0000${controller.name}`;
}

/** A roster and socket owned by one mounted television. */
export function createCastControllerStore() {
  let controllers: readonly CastController[] = NOBODY;
  let uplink: ((message: CastClientMessage) => void) | null = null;
  const listeners = new Set<() => void>();
  const read = () => controllers;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const setCastControllers = (next: readonly CastController[]): CastController[] => {
    const before = new Set(controllers.map(who));
    controllers = next.length === 0 ? NOBODY : next;
    for (const listener of listeners) listener();
    return next.filter((c) => !before.has(who(c)));
  };
  const setCastUplink = (send: ((message: CastClientMessage) => void) | null): void => {
    uplink = send;
    if (!send) setCastControllers(NOBODY);
  };
  const kickCastController = (controllerId: ControllerId): void => {
    uplink?.({ type: 'cast.kick', controllerId });
  };
  return { read, subscribe, setCastControllers, setCastUplink, kickCastController };
}

export type CastControllerStore = ReturnType<typeof createCastControllerStore>;
const Context = createContext<CastControllerStore | null>(null);
export const CastControllerStoreProvider = Context.Provider;

export function CastControllersProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createCastControllerStore);
  return createElement(Context.Provider, { value: store }, children);
}

export function useCastControllerStore(): CastControllerStore {
  const store = useContext(Context);
  if (!store) throw new Error('Cast controls require CastControllersProvider');
  return store;
}

export function useCastControllers(): readonly CastController[] {
  const store = useCastControllerStore();
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}
