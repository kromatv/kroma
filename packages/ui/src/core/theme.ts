// Each styling root owns its token store; KROMA is the immutable fallback.
//
// `setTheme` swaps the active theme and bumps a version; recipes, `styles()` and
// <Box> all check that version and re-resolve lazily on their next use, so a
// switch costs one rebuild per recipe actually rendered, not an eager sweep.

import { KROMA, type Theme } from '#ui/core/theme-create';
import { collectSteps, restated, rulesOf } from '#ui/core/theme-restated';
import { CSS_COLORS, CSS_FONTS, CSS_RADIUS, CSS_TYPE } from '#ui/core/tokens/css-palette';

export * from '#ui/core/theme-create';

/** Mutable theme state belongs to a mounted styling root. */
export function createThemeRuntime(initial: Theme = KROMA) {
  let active: Theme = initial;
  // The theme as it was handed over, for telling a swap that moves the store's
  // own tokens from one the cascade absorbs: `active` reads restated values back
  // as properties, so it cannot be the one compared.
  let applied: Theme = initial;
  // Starts at 1 so a consumer can use 0 (or -1) as "never resolved".
  let version = 1;
  const listeners = new Set<() => void>();
  let paper: Theme | undefined;

  function activeTheme(): Theme {
    return active;
  }

  /** Monotonic; bumped by every `setTheme`. Anything that caches resolved styles
   *  keys on it (see recipe.ts, styles.ts, box-style.ts). */
  function themeVersion(): number {
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

  const block = (selector: string, theme: Theme | undefined, doc: Document): string => {
    const rules = theme ? restated(theme, stepsOf(doc)) : [];
    if (rules.length === 0) return '';
    const body = rules.map(([name, value]) => `${name}:${value}`).join(';');
    return `${selector}{${body}}`;
  };

  let scope: HTMLElement | null = null;
  let scopeId = '';
  const sheetId = () => `kroma-theme-${scopeId}`;

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
    const doc = scope?.ownerDocument;
    if (!doc || !scopeId) return;
    // A theme given no light half paints the same values in every ground.
    const paper = light ?? theme;
    const systemSelector = `[data-kroma-theme="${scopeId}"]:not([data-theme])`;
    const css = [
      block(`[data-kroma-theme="${scopeId}"]`, theme, doc),
      block(`[data-kroma-theme="${scopeId}"][data-theme="light"]`, paper, doc),
      `@media(prefers-color-scheme:light){${block(systemSelector, paper, doc)}}`,
    ]
      .filter((rule) => !rule.endsWith('{}'))
      .join('');
    const found = doc.getElementById(sheetId());
    if (!css) {
      found?.remove();
      return;
    }
    const sheet =
      found ?? doc.head.appendChild(Object.assign(doc.createElement('style'), { id: sheetId() }));
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
  function setTheme(theme: Theme, light?: Theme): void {
    if (theme === active) return;
    applied = theme;
    active = theme;
    version += 1;
    paper = light;
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
  function applyTheme(theme: Theme, light?: Theme): void {
    if (!CSS_COLORS) {
      setTheme(theme, light);
      return;
    }
    paper = light;
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
  function onThemeChange(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    activeTheme,
    themeVersion,
    onThemeChange,
    setTheme,
    applyTheme,
    attach(host: HTMLElement, id: string) {
      scope = host;
      scopeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
      host.dataset.kromaTheme = scopeId;
      publish(applied, paper);
      return () => {
        host.ownerDocument.getElementById(sheetId())?.remove();
        delete host.dataset.kromaTheme;
        scope = null;
      };
    },
  };
}

export type ThemeRuntime = ReturnType<typeof createThemeRuntime>;
export function activeTheme(runtime?: ThemeRuntime): Theme {
  return runtime?.activeTheme() ?? KROMA;
}
export function themeVersion(runtime?: ThemeRuntime): number {
  return runtime?.themeVersion() ?? 0;
}
export function themedCache<T>(
  limit: number,
  runtime?: ThemeRuntime,
): (key: string, make: () => T) => T {
  const entries = new Map<string, T>();
  let at = -1;
  return (key, make) => {
    const version = themeVersion(runtime);
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
export function themed<T>(
  make: (theme: Theme) => T,
  runtime?: ThemeRuntime,
): (owner?: ThemeRuntime) => T {
  const values = new WeakMap<object, { version: number; value: T }>();
  return (owner = runtime) => {
    const key = owner ?? KROMA;
    const version = themeVersion(owner);
    const cached = values.get(key);
    if (cached?.version === version) return cached.value;
    const value = make(activeTheme(owner));
    values.set(key, { version, value });
    return value;
  };
}
