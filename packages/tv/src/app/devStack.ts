import { useEffect } from 'react';
import type { TvRoute, TvScreens } from './router';

// Dev-only: the stack is in-memory, so it is mirrored to sessionStorage to survive
// an HMR full-reload. Compiled out of production builds via IS_DEV.
const IS_DEV = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true;
const DEV_NAV_KEY = 'kroma:dev-nav';

function isTvRoute(entry: unknown, screens: TvScreens): entry is TvRoute {
  if (typeof entry !== 'object' || entry === null) return false;
  if (!('name' in entry) || typeof entry.name !== 'string') return false;
  if (!Object.hasOwn(screens, entry.name)) return false;
  return !('params' in entry) || entry.params === undefined || typeof entry.params === 'object';
}

/** The stack a development reload left behind, or null in production and
 * whenever any of its screens is no longer registered. */
export function loadDevStack(screens: TvScreens): TvRoute[] | null {
  if (!IS_DEV) return null;
  try {
    // oxlint-disable-next-line no-restricted-globals -- audited - dev-only (IS_DEV) and inside try/catch, so React Native simply keeps the default stack.
    const saved = sessionStorage.getItem(DEV_NAV_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    // All or nothing: a stack the running build no longer knows every screen of
    // would render `undefined` as a component.
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const known = (entry: unknown): entry is TvRoute => isTvRoute(entry, screens);
    return parsed.every(known) ? parsed : null;
  } catch {
    return null;
  }
}

/** Mirrors the stack for {@link loadDevStack}; does nothing in production. */
export function useDevStackMirror(stack: readonly TvRoute[]): void {
  useEffect(() => {
    if (!IS_DEV) return;
    try {
      // oxlint-disable-next-line no-restricted-globals -- audited - dev-only (IS_DEV) and inside try/catch.
      sessionStorage.setItem(DEV_NAV_KEY, JSON.stringify(stack));
    } catch {
      /* ignore quota/availability */
    }
  }, [stack]);
}
