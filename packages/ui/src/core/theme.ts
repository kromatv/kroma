// The theme: every token group behind one live store, and KROMA as the default.
//
// `setTheme` swaps the active theme and bumps a version; recipes, `styles()` and
// <Box> all check that version and re-resolve lazily on their next use, so a
// switch costs one rebuild per recipe actually rendered, not an eager sweep.

import { webDocument } from '#ui/lib/dom';
import { KROMA, KROMA_LIGHT, type Theme } from './theme-create';
import { withAlpha } from './tokens/colors';
import { CSS_COLORS } from './tokens/css-palette';
import { cssVar } from './tokens/css-var';
import { CIRCLE_RADIUS, type CornerValue } from './tokens/layout';

export * from './theme-create';

let active: Theme = KROMA;
// Starts at 1 so a consumer can use 0 (or -1) as "never resolved".
let version = 1;
const listeners = new Set<() => void>();

export function activeTheme(): Theme {
  return active;
}

/**
 * Whether a theme paints on paper.
 *
 * Always false on a browser, where the cascade owns the ground: this answers
 * for what the cascade cannot reach, a native blur view needing its own tint.
 */
export function onPaper(theme: Theme = active): boolean {
  return !CSS_COLORS && theme.colors.bg === KROMA_LIGHT.colors.bg;
}

/**
 * The active ground at an alpha, for the gradients artwork fades into. Unlike
 * `shade()`, which is always the dark ground, this one follows the theme.
 *
 * Read it during render: a value taken at module scope freezes to the ground
 * that happened to be active at import.
 */
export function groundShade(alpha: number): string {
  return withAlpha(active.colors.bg, alpha);
}

/**
 * A corner in px, for the places that need the number rather than a style
 * declaration: a <Frost> layer clipping itself, a nested corner, an animated
 * value. `side` is the box's own side and only `'circle'` reads it.
 */
export function radiusValue(corner: CornerValue, side?: number): number {
  if (typeof corner === 'number') return corner;
  if (corner === 'circle') return side === undefined ? CIRCLE_RADIUS : side / 2;
  return active.radius[corner];
}

/** Monotonic; bumped by every `setTheme`. Anything that caches resolved styles
 *  keys on it (see recipe.ts, styles.ts, box-style.ts). */
export function themeVersion(): number {
  return version;
}

// An untouched token resolves to its own property (see `paint`), so it has to be
// released rather than written back as a self-reference.
function publish(theme: Theme): void {
  const root = webDocument()?.documentElement;
  if (!root) return;
  const write = (name: string, value: string) => {
    if (value.startsWith('var(')) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  };
  for (const [token, value] of Object.entries(theme.colors)) write(cssVar(token), value);
  for (const [token, value] of Object.entries(theme.shadow)) write(`--shadow-${token}`, value);
}

export function setTheme(theme: Theme): void {
  if (theme === active) return;
  active = theme;
  version += 1;
  publish(theme);
  for (const listener of listeners) listener();
}

/** Subscribe to theme swaps; returns the unsubscribe. Shaped for
 *  `useSyncExternalStore`, which is exactly what `useTheme` feeds it to. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A value derived from the theme, memoised per swap: call the returned function
 * at use time and it recomputes only when the theme has changed. This is how a
 * module holds something theme-flavoured (a gradient string, a paint bundle)
 * without freezing it to the palette of module-load time.
 */
export function themed<T>(make: (theme: Theme) => T): () => T {
  let at = -1;
  let value: T;
  return () => {
    if (at !== version) {
      value = make(active);
      at = version;
    }
    return value;
  };
}

/**
 * The same, keyed: many values behind one memo, emptied on every swap. What a
 * resolved style, a resolved <Box> prop bag and a resolved icon paint are kept
 * in.
 *
 * Capped, because the key is the caller's and one built from a measured number
 * would otherwise mint an entry forever; past the cap it computes correctly and
 * stops remembering.
 */
export function themedCache<T>(limit: number): (key: string, make: () => T) => T {
  const entries = new Map<string, T>();
  let at = -1;
  return (key, make) => {
    if (at !== version) {
      entries.clear();
      at = version;
    }
    const hit = entries.get(key);
    if (hit !== undefined) return hit;
    const made = make();
    if (entries.size < limit) entries.set(key, made);
    return made;
  };
}
