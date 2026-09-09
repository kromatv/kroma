// The theme: every token group behind one live store, and KROMA as the default.
//
// `setTheme` swaps the active theme and bumps a version; recipes, `styles()` and
// <Box> all check that version and re-resolve lazily on their next use, so a
// switch costs one rebuild per recipe actually rendered, not an eager sweep.

import { KROMA, KROMA_LIGHT, type Theme } from '#ui/core/theme-create';
import { splitAlpha, withAlpha } from '#ui/core/tokens/colors';
import {
  CSS_COLORS,
  CSS_FONTS,
  CSS_RADIUS,
  CSS_TYPE,
  typeProperty,
} from '#ui/core/tokens/css-palette';
import { cssName, cssVar } from '#ui/core/tokens/css-var';
import {
  CIRCLE_RADIUS,
  type CornerValue,
  type Radius,
  type RadiusToken,
} from '#ui/core/tokens/layout';
import { fontStack, type RoleStyle } from '#ui/core/tokens/typography';
import { webDocument } from '#ui/lib/dom';

export * from '#ui/core/theme-create';

let active: Theme = KROMA;
// The theme as it was handed over, for telling a swap that moves the store's
// own tokens from one the cascade absorbs: `active` reads restated values back
// as properties, so it cannot be the one compared.
let applied: Theme = KROMA;
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

const isRadiusToken = (corner: string): corner is RadiusToken => corner in active.radius;

/**
 * A corner as a style takes it, for the places that hold the value rather than
 * a declaration: a <Frost> layer clipping itself, a nested corner, a group's
 * ends. On a browser a token is the custom property the theme rewrites, so
 * derive from it with {@link nestedRadius} or {@link scaledRadius} rather than
 * arithmetic. `side` is the box's own side and only `'circle'` reads it.
 */
export function radiusValue(corner: CornerValue, side?: number): Radius {
  if (typeof corner === 'number') return corner;
  if (corner === 'circle') return side === undefined ? CIRCLE_RADIUS : side / 2;
  return isRadiusToken(corner) ? active.radius[corner] : corner;
}

/** A corner scaled with the chrome it sits in (see the player's `scaler`). */
export function scaledRadius(corner: CornerValue, factor: number): Radius {
  const value = radiusValue(corner);
  if (typeof value === 'number') return Math.round(value * factor);
  return factor === 1 ? value : `calc(${value} * ${factor})`;
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
  const radii = Object.entries(theme.radius)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .map(([token, value]) => [`--radius-${token}`, `${value}px`] as const);
  const fonts = Object.entries(theme.fonts)
    .filter(([, value]) => !value.startsWith('var('))
    .map(([token, value]) => [`--font-${token}`, fontStack(value)] as const);
  const roles = Object.entries(theme.type)
    .filter(([, style]) => typeof style.fontSize === 'number')
    .flatMap(([role, style]) => roleProperties(role, style));
  return [...colors, ...shadows, ...radii, ...fonts, ...roles];
}

// A restated role, derived to px by the theme, under the properties every
// untouched role already reads.
function roleProperties(role: string, style: RoleStyle): (readonly [string, string])[] {
  const family = style.fontFamily ?? '';
  const out: (readonly [string, string])[] = [
    [typeProperty(role, 'family'), family.startsWith('var(') ? family : fontStack(family)],
    [typeProperty(role, 'weight'), String(style.fontWeight)],
    [typeProperty(role, 'size'), `${style.fontSize}px`],
    [typeProperty(role, 'line'), `${style.lineHeight}px`],
  ];
  if (style.letterSpacing !== undefined) {
    out.push([typeProperty(role, 'spacing'), `${style.letterSpacing}px`]);
  }
  return out;
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
  return Object.freeze({
    ...theme,
    colors: { ...theme.colors, ...CSS_COLORS },
    ...(CSS_RADIUS ? { radius: { ...theme.radius, ...CSS_RADIUS } } : null),
    ...(CSS_FONTS ? { fonts: { ...theme.fonts, ...CSS_FONTS } } : null),
    ...(CSS_TYPE ? { type: { ...theme.type, ...CSS_TYPE } } : null),
  });
}

// What the STORE owns, because no custom property can carry it: the numbers
// layout is done with. Off the browser that is every radius and face as well;
// on one those are the cascade's, like colour. A type spec stays the store's
// everywhere: a text node's rhythm is measured from its numbers.
const CARRIED_BY_STORE: readonly (keyof Theme)[] = [
  'typeSpec',
  'motion',
  'gutter',
  'space',
  'rhythm',
  'tracking',
];
const STORE_TOKENS: readonly (keyof Theme)[] = CSS_RADIUS
  ? CARRIED_BY_STORE
  : ['radius', 'fonts', ...CARRIED_BY_STORE];

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
  applied = theme;
  active = theme;
  version += 1;
  publish(theme, light);
  for (const listener of listeners) listener();
}

/**
 * Applies a theme through the CASCADE where there is one, which on a browser is
 * every token but the handful the store owns (see `STORE_TOKENS`).
 *
 * A theme that restates nothing but colour, radius or a face therefore costs
 * one stylesheet write and NOTHING else - no version bump, no re-render, no
 * remount - because the properties it redefines are the same ones every
 * resolved style already points at. Only a theme that moves a type scale
 * reaches the store, and only that theme pays for the tree to render again.
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
  if (sameShape(applied, theme)) return;
  applied = theme;
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
