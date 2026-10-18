import { createContext, useContext, useSyncExternalStore } from 'react';
import type { StyleRuntime } from './style-runtime';
import { DEFAULT_STYLE_SCOPE } from './style-scope';

export const StyleRuntimeContext = createContext<StyleRuntime | null>(null);
export const useStyleRuntimeParent = () => useContext(StyleRuntimeContext);
const EMPTY_SUBSCRIBE = () => () => {};
const DEFAULT_SNAPSHOT = () => DEFAULT_STYLE_SCOPE;
/** A root-shared immutable snapshot gives the compiler a new identity on a theme swap. */
export function useStyleScope() {
  const runtime = useContext(StyleRuntimeContext);
  return useSyncExternalStore(
    runtime?.theme.onThemeChange ?? EMPTY_SUBSCRIBE,
    runtime?.styleScope ?? DEFAULT_SNAPSHOT,
    runtime?.styleScope ?? DEFAULT_SNAPSHOT,
  );
}
export function useStyleRuntime(): StyleRuntime {
  const runtime = useContext(StyleRuntimeContext);
  if (!runtime) throw new Error('Styling controls require KitProvider or ThemeProvider');
  return runtime;
}
