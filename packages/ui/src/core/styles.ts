import { useStyleScope } from './style-context';
import { DEFAULT_STYLE_SCOPE, type StyleScope } from './style-scope';
import { useBreakpointStep } from './use-breakpoint';
import { useThemeVersion } from './use-theme';
// Reusable styles that are not a variant of anything.
//
// `sv` covers a component's design: what changes with a prop or a state.
// This covers the rest: the shapes a file reuses, which had no home but a
// module constant.

import { type StyleProp, StyleSheet } from 'react-native';
import { breakpointIndex, breakpointStep } from '#ui/core/breakpoint';
import { normalize } from '#ui/core/normalize';
import { declaredBreakpoints } from '#ui/core/shorthand-resolve';
import { stabilise } from '#ui/core/stabilise';
import { activeTheme, themedCache, themeVersion } from '#ui/core/theme';
import type { AnyStyle, StyleDecl } from '#ui/core/types';

export type Styles<S> = { readonly [K in keyof S]: AnyStyle };

/**
 * Resolve a named set of styles, once per theme, on first use - and once more
 * per breakpoint the set actually names, which is never for a set that names
 * none.
 *
 * Shaped like `StyleSheet.create` so it reads the way React Native already
 * does, but speaking the kit's vocabulary (shorthands, colour tokens and the
 * `/NN` alpha suffix) and returning one lowercase binding instead of a spread
 * of shouting constants:
 *
 *   const s = styles({
 *     row: { row: true, align: 'center', gap: 6, px: 8, radius: 'sm' },
 *     label: { fontSize: 13, color: 'textMuted' },
 *   });
 *
 *   <Box style={s.row}><Text style={s.label} /></Box>
 *
 * Each value goes through `StyleSheet.create`, so react-native-web compiles it
 * to atomic CSS classes shared with every other style that declares the same
 * thing, rather than re-serialising it onto each element.
 *
 * Bind the definition with `const s = useStyles(definition)` inside a component.
 * The hook resolves against that styling root and subscribes to its theme and
 * only the breakpoint steps the declaration names. A swap returns fresh style
 * objects so the compiler and react-native-web can observe the change.
 * Outside React, pass an explicit StyleScope or use resolveStyles; an unbound
 * definition resolves against immutable KROMA defaults.
 */
const RESOLVE = Symbol('scoped-styles');
const MASK = Symbol('style-breakpoints');
type StyleBinding<S> = Styles<S> & {
  [RESOLVE]: (scope: StyleScope, version?: number, index?: number) => Styles<S>;
  [MASK]: number;
};

export function styles<const S extends Record<string, StyleDecl>>(
  decls: S,
  owner: StyleScope = DEFAULT_STYLE_SCOPE,
): Styles<S> {
  const owners = new WeakMap<StyleScope, { at: number; step: number; built: Styles<S> }>();
  const mask = Object.values(decls).reduce((bits, decl) => bits | declaredBreakpoints(decl), 0);
  const resolve = (
    scope: StyleScope,
    at = themeVersion(scope.theme),
    index = breakpointIndex(scope.breakpoints),
  ): Styles<S> => {
    const step = breakpointStep(mask, index);
    const cached = owners.get(scope);
    if (cached?.at === at && cached.step === step) return cached.built;
    const resolved: Record<string, AnyStyle> = {};
    for (const [name, decl] of Object.entries(decls))
      resolved[name] = stabilise(normalize(decl, index, activeTheme(scope.theme))) as AnyStyle;
    const built = resolved as Styles<S>;
    owners.set(scope, { at, step, built });
    return built;
  };
  return new Proxy({} as Styles<S>, {
    get: (_, key) => {
      if (key === RESOLVE) return resolve;
      if (key === MASK) return mask;
      return Reflect.get(resolve(owner), key);
    },
    has: (_, key) => key in resolve(owner),
    ownKeys: () => Reflect.ownKeys(resolve(owner)),
    getOwnPropertyDescriptor: (_, key) => {
      const desc = Object.getOwnPropertyDescriptor(resolve(owner), key);
      return desc ? { ...desc, configurable: true } : undefined;
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

export function resolveStyles<S>(definition: Styles<S>, scope: StyleScope): Styles<S> {
  return (definition as StyleBinding<S>)[RESOLVE](scope);
}

/** Bind a declaration to this root and subscribe only to relevant breakpoint steps. */
export function useStyles<S>(definition: Styles<S>): Styles<S> {
  const scope = useStyleScope();
  const binding = definition as StyleBinding<S>;
  const version = useThemeVersion();
  const step = useBreakpointStep(binding[MASK]);
  return binding[RESOLVE](scope, version, step);
}

/** One style, for the handful of places a set of one would be noise. Resolved
 *  against the theme active at the first read. A caller that must follow a
 *  swap uses `styles()` and reads at render time. */
export function style<const T extends StyleDecl>(decl: T): AnyStyle {
  return styles({ only: decl }).only;
}

const shared = new WeakMap<
  StyleScope,
  ReturnType<typeof themedCache<AnyStyle & Record<string, unknown>>>
>();

const rebuilt = themedCache<AnyStyle>(4096);

/**
 * A style a third party rebuilt as a plain object, registered again by its
 * content: a router's link spreads the style the kit hands it into its own
 * active-state style, and the fresh object it makes is registered by nothing,
 * so the browser paints every property of it inline. Keyed on the content,
 * every link carrying the same paint shares one entry and one set of classes.
 */
export function registered(style: StyleProp<AnyStyle>): AnyStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  return rebuilt(JSON.stringify(flat), () => stabilise(flat) as AnyStyle);
}

/**
 * A style shared by identity with every caller passing the same `key`, for the
 * values a render computes rather than declares.
 *
 * Registered like `styles`, and shared by identity on top of that: styleq keys
 * its compiled-style cache on the leaf object, so resolving one per render is a
 * guaranteed miss even once the declaration compiles to a class.
 *
 * The key identifies the DECLARATION, so one stating a value per breakpoint
 * carries the step it was resolved at (see <Text>); the breakpoint is not part
 * of the key by itself, which is what keeps a flat declaration at one entry.
 */
export function sharedStyle(
  key: string,
  decl: StyleDecl,
  scope: StyleScope = DEFAULT_STYLE_SCOPE,
): AnyStyle & Record<string, unknown> {
  let cache = shared.get(scope);
  if (!cache) {
    cache = themedCache<AnyStyle & Record<string, unknown>>(4096, scope.theme);
    shared.set(scope, cache);
  }
  return cache(key, () =>
    stabilise(normalize(decl, breakpointIndex(scope.breakpoints), activeTheme(scope.theme))),
  );
}
