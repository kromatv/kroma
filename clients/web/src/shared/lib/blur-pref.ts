// Whether glass surfaces blur what is behind them, on this device. A browser
// that composites `backdrop-filter` on the CPU pays for every frosted control on
// screen at once, and the plain fill underneath is what the design falls back to
// anyway.
//
// Device-local, like the engine override in features/playback/engine-pref: it is
// a property of the machine, not of the account, so it is not sent anywhere.

import { KitProvider } from '@kromatv/ui/kit';
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

const KEY = 'kroma:blur';
export function getBlurPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
function persist(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* the root still keeps its choice */
  }
}
const Context = createContext<readonly [boolean, (on: boolean) => void] | null>(null);
export function BlurPreferenceProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(getBlurPref);
  const set = useCallback((next: boolean) => {
    setEnabled(next);
    persist(next);
  }, []);
  const value = useMemo(() => [enabled, set] as const, [enabled, set]);
  const config = useMemo(() => ({ frostEnabled: enabled }), [enabled]);
  return createElement(
    Context.Provider,
    { value },
    createElement(KitProvider, { config }, children),
  );
}
export function useBlurPreference(): readonly [boolean, (on: boolean) => void] {
  const value = useContext(Context);
  if (!value) throw new Error('Blur preferences require BlurPreferenceProvider');
  return value;
}
