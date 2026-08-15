// The theme: every token group behind one live store, and KROMA as the default.
//
// `setTheme` swaps the active theme and bumps a version; recipes, `styles()` and
// <Box> all check that version and re-resolve lazily on their next use, so a
// switch costs one rebuild per recipe actually rendered, not an eager sweep.

import { webDocument } from '#ui/lib/dom';
import { KROMA, KROMA_LIGHT, type Theme } from './theme-create';
import { splitAlpha, withAlpha } from './tokens/colors';
import { CSS_COLORS } from './tokens/css-palette';
import { cssName, cssVar } from './tokens/css-var';
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

// Every property the build emitted for a colour, read off the token sheet once.
//
// A palette token is not one property: the build also emits a property per
// ALPHA STEP the source asks for (`text/75` -> --kroma-text-75) and, for a
// token that is already translucent, the opaque/alpha pair a platform without
// colour-mix needs. A theme that restates `text` and stops there leaves every
// one of those holding the built-in ink - which is a label that vanishes rather
// than a label in the wrong colour. The sheet knows which ones exist, so this
// asks it rather than guessing.
let derivedProps: Map<string, readonly string[]> | null = null;

const DERIVED_PROP = /--kroma-([a-z0-9-]+?)-(\d+(?:_\d+)?|opaque|alpha)\s*:/g;

// A cross-origin sheet answers `cssRules` with a SecurityError; it holds none of
// ours, so it is skipped rather than read.
function rulesOf(sheet: CSSStyleSheet): readonly CSSRule[] {
  try {
    return [...sheet.cssRules];
  } catch {
    return [];
  }
}

function collectSteps(css: string, found: Map<string, string[]>): void {
  for (const [, name, step] of css.matchAll(DERIVED_PROP)) {
    if (!name || !step) continue;
    const steps = found.get(name) ?? [];
    if (!steps.includes(step)) steps.push(step);
    found.set(name, steps);
  }
}

function stepsOf(doc: Document): Map<string, readonly string[]> {
  // Cached once found, never cached empty: the token sheet may still be on its
  // way in (a code-split chunk, a dev server's first paint), and an empty scan
  // remembered would leave every theme after it without its alpha steps.
  if (derivedProps?.size) return derivedProps;
  const found = new Map<string, string[]>();
  for (const sheet of doc.styleSheets) {
    for (const rule of rulesOf(sheet)) collectSteps(rule.cssText, found);
  }
  if (found.size > 0) derivedProps = found;
  return found;
}

function derived(token: string, value: string, steps: readonly string[]) {
  const faded = splitAlpha(value);
  return steps.map((step) => {
    if (step === 'opaque') return [`${cssVar(token)}-opaque`, faded.color] as const;
    if (step === 'alpha') return [`${cssVar(token)}-alpha`, String(faded.opacity)] as const;
    const alpha = Number(step.replace('_', '.'));
    return [cssVar(token, step), withAlpha(value, alpha / 100)] as const;
  });
}

// What a theme RESTATES: `paint` leaves an untouched token as its own property,
// so anything that is not a `var(...)` is a value this theme decided.
function restated(theme: Theme, doc: Document): readonly (readonly [string, string])[] {
  const steps = stepsOf(doc);
  const colors = Object.entries(theme.colors)
    .filter(([, value]) => !value.startsWith('var('))
    .flatMap(([token, value]) => [
      [cssVar(token), value] as const,
      ...derived(token, value, steps.get(cssName(token)) ?? []),
    ]);
  const shadows = Object.entries(theme.shadow)
    .filter(([, value]) => !value.startsWith('var('))
    .map(([token, value]) => [`--shadow-${token}`, value] as const);
  return [...colors, ...shadows];
}

const block = (selector: string, theme: Theme | undefined, doc: Document): string => {
  const rules = theme ? restated(theme, doc) : [];
  if (rules.length === 0) return '';
  const body = rules.map(([name, value]) => `${name}:${value}`).join(';');
  return `${selector}{${body}}`;
};

const SHEET_ID = 'kroma-theme';

/**
 * A restatement reaches the page as a STYLESHEET, not as inline properties on
 * the root.
 *
 * The difference is the ground: inline properties outrank every selector, so a
 * theme written that way pins its tokens to one ground and `[data-theme]` stops
 * reaching them. Written as rules after the token sheet they win the same way
 * for the ground they name, and a theme that restates both grounds hands the
 * switch back to the cascade - which is what makes swapping ground under a
 * theme cost nothing at all.
 *
 * The three blocks are the token sheet's own three, in its order and with its
 * selectors (see vite/tokens.ts). Matching it is not tidiness: the unstamped
 * document - `system`, the default - is painted by a rule carrying a `:not()`,
 * and a plainer selector here would lose to it however late it arrives.
 */
function publish(theme: Theme, light: Theme | undefined): void {
  const doc = webDocument();
  if (!doc) return;
  // A theme given no light half paints the same values in every ground.
  const paper = light ?? theme;
  const css = [
    block(':root,[data-theme="dark"]', theme, doc),
    block('[data-theme="light"]', paper, doc),
    `@media(prefers-color-scheme:light){${block(':root:not([data-theme])', paper, doc)}}`,
  ]
    .filter((rule) => !rule.endsWith('{}'))
    .join('');
  const found = doc.getElementById(SHEET_ID);
  if (!css) {
    found?.remove();
    return;
  }
  const sheet =
    found ?? doc.head.appendChild(Object.assign(doc.createElement('style'), { id: SHEET_ID }));
  sheet.textContent = css;
}

// A ground-aware theme resolves its restated tokens through the cascade like
// every untouched one: both grounds are published, so a literal in the store
// would be the one value that could not follow the switch.
function cascading(theme: Theme): Theme {
  if (!CSS_COLORS) return theme;
  return Object.freeze({ ...theme, colors: { ...theme.colors, ...CSS_COLORS } });
}

// What the STORE owns, because no custom property can carry it: a radius is a
// number React Native lays out with, a face is a family a text node is measured
// in. Everything else about a theme is colour, and colour is the cascade's.
const STORE_TOKENS = [
  'radius',
  'fonts',
  'typeSpec',
  'motion',
  'gutter',
  'space',
  'rhythm',
  'tracking',
] as const;

function sameShape(a: Theme, b: Theme): boolean {
  return STORE_TOKENS.every((group) => JSON.stringify(a[group]) === JSON.stringify(b[group]));
}

/**
 * Swaps the active theme, pinned: the store holds it as written, so every
 * resolved value is this theme's whatever the document's ground says. That is
 * what `KROMA_LIGHT` means on a browser, and the only shape a platform without
 * a cascade has.
 *
 * Reach for `applyTheme` on a browser instead, unless pinning is the point.
 */
export function setTheme(theme: Theme, light?: Theme): void {
  if (theme === active) return;
  active = theme;
  version += 1;
  publish(theme, light);
  for (const listener of listeners) listener();
}

/**
 * Applies a theme through the CASCADE where there is one, which on a browser is
 * every token but the handful the store owns (see `STORE_TOKENS`).
 *
 * A theme that restates nothing but colour therefore costs one stylesheet write
 * and NOTHING else - no version bump, no re-render, no remount - because the
 * properties it redefines are the same ones every resolved style already points
 * at. Only a theme that moves a radius, a face or a type scale reaches the
 * store, and only that theme pays for the tree to render again.
 *
 * `light` is the theme's paper half, for one that restates the ground itself;
 * without it the theme paints the same values in both grounds. Off the browser
 * there is no cascade to apply anything to, so this is `setTheme`.
 */
export function applyTheme(theme: Theme, light?: Theme): void {
  if (!CSS_COLORS) {
    setTheme(theme, light);
    return;
  }
  publish(theme, light);
  // The store keeps the theme's own structure but hands colour back to the
  // cascade, or a literal here would be the one value a ground switch under
  // this theme could not reach.
  const next = cascading(theme);
  if (sameShape(active, theme)) return;
  active = next;
  version += 1;
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
