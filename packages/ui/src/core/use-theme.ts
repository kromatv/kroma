// The React face of the theme store. Separate from theme.ts so the store stays
// importable from non-React code (the resolver, tests, scripts).

import { createElement, Fragment, type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { activeTheme, onThemeChange, setTheme, type Theme, themeVersion } from './theme';

/** The active theme, live: re-renders the caller when it swaps. For reading a
 *  token a STYLE cannot carry (an ActivityIndicator's colour prop, a chart's
 *  series paint) — declarations don't need it, they re-resolve by themselves. */
export function useTheme(): Theme {
  return useSyncExternalStore(onThemeChange, activeTheme, activeTheme);
}

interface ThemeProviderProps {
  theme?: Theme;
  children?: ReactNode;
}

/**
 * Applies `theme` and re-renders the subtree whenever the active theme changes.
 *
 * The re-render is a REMOUNT (the version is the key): resolved styles are read
 * during render, so every themed node must render again, and a keyed fragment is
 * the one mechanism that reaches children this component did not create. Theme
 * swaps are rare and deliberate; place the provider under whatever state must
 * survive one.
 *
 * There is exactly one active theme per app — this is a switch, not a scope, so
 * providers do not nest.
 */
export function ThemeProvider({ theme, children }: Readonly<ThemeProviderProps>) {
  const version = useSyncExternalStore(onThemeChange, themeVersion, themeVersion);
  useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme]);
  return createElement(Fragment, { key: version }, children);
}
