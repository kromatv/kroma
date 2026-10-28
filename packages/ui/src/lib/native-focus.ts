import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** Whether tvOS's own focus follows the app's here: the control the app focuses is the view tvOS focuses. */
export const NATIVE_FOCUS = Platform.isTV === true && Platform.OS === 'ios';

/** The claims on tvOS's focus under one window: the latest claim holds it. */
export interface NativeFocusHost {
  claim: (claim: string) => void;
  release: (claim: string) => void;
  holder: () => string | null;
  subscribe: (listener: () => void) => () => void;
}

function createNativeFocusHost(): NativeFocusHost {
  const claims: string[] = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    claim: (claim) => {
      claims.push(claim);
      notify();
    },
    release: (claim) => {
      const at = claims.indexOf(claim);
      if (at < 0) return;
      claims.splice(at, 1);
      notify();
    },
    holder: () => claims.at(-1) ?? null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const NativeFocusContext = createContext<NativeFocusHost | null>(null);

/** Provided by <FocusRoot> to the controls under it. */
export const NativeFocusProvider = NativeFocusContext.Provider;

/**
 * For <FocusRoot>: the host its controls claim tvOS's focus from, and whether one of
 * them holds it, which is when its key host must stop being a place tvOS could move
 * to. A root that `shares` uses the host of the root it sits in, so a sheet or a
 * dialog drawn in the same window competes with the screen behind it for one focus.
 */
export function useNativeFocusHost(shares: boolean): { held: boolean; host: NativeFocusHost } {
  const parent = useContext(NativeFocusContext);
  const [own] = useState(createNativeFocusHost);
  const host = shares && parent ? parent : own;
  const held = useSyncExternalStore(host.subscribe, () => host.holder() !== null);
  return { held, host };
}

/** Whether tvOS should focus this control now: it is focused, and its claim is the latest. */
export function useNativeFocus(focused: boolean): boolean {
  const host = useContext(NativeFocusContext);
  const wants = NATIVE_FOCUS && focused && host !== null;
  const claim = useId();
  useEffect(() => {
    if (!wants || !host) return;
    host.claim(claim);
    return () => host.release(claim);
  }, [wants, host, claim]);
  const holder = useSyncExternalStore(
    host?.subscribe ?? NO_SUBSCRIBE,
    () => host?.holder() ?? null,
  );
  return wants && holder === claim;
}

const NO_SUBSCRIBE = () => () => {};
