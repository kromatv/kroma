import {
  createContext,
  createElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useSyncExternalStore,
} from 'react';
import type { StyleRuntime } from './style-runtime';
import { DEFAULT_STYLE_SCOPE, type StyleScope } from './style-scope';

export const StyleRuntimeContext = createContext<StyleRuntime | null>(null);
const StyleScopeContext = createContext<StyleScope>(DEFAULT_STYLE_SCOPE);
/** The root's breakpoint index; -1 outside a root, where the width is read live. */
export const BreakpointIndexContext = createContext(-1);
export const useStyleRuntimeParent = () => useContext(StyleRuntimeContext);

/** Hands a styling root's runtime, its scope snapshot and its breakpoint index
 *  to everything under it. The root subscribes once; a theme swap or a width
 *  crossing a breakpoint reaches the components through context. */
export function StyleRuntimeProvider({
  runtime,
  children,
}: Readonly<{ runtime: StyleRuntime; children?: ReactNode }>): ReactElement {
  const scope = useSyncExternalStore(
    runtime.theme.onThemeChange,
    runtime.styleScope,
    runtime.styleScope,
  );
  const index = useSyncExternalStore(
    runtime.breakpoints.subscribe,
    runtime.breakpoints.index,
    runtime.breakpoints.index,
  );
  return createElement(
    StyleRuntimeContext.Provider,
    { value: runtime },
    createElement(
      StyleScopeContext.Provider,
      { value: scope },
      createElement(BreakpointIndexContext.Provider, { value: index }, children),
    ),
  );
}

/** A root-shared immutable snapshot gives the compiler a new identity on a theme swap. */
export function useStyleScope(): StyleScope {
  return useContext(StyleScopeContext);
}

export function useStyleRuntime(): StyleRuntime {
  const runtime = useContext(StyleRuntimeContext);
  if (!runtime) throw new Error('Styling controls require KitProvider or ThemeProvider');
  return runtime;
}
