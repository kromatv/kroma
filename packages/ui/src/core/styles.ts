// Reusable styles that are not a variant of anything.
//
// `sv` covers a component's design — what changes with a prop or a state.
// This covers the rest: the shapes a file reuses, which had no home but a
// module constant.

import { breakpointStep } from '#ui/core/breakpoint';
import { normalize, stabilise } from '#ui/core/normalize';
import { declaredBreakpoints } from '#ui/core/shorthands';
import { themeVersion } from '#ui/core/theme';
import type { AnyStyle, StyleDecl } from '#ui/core/types';

export type Styles<S> = { readonly [K in keyof S]: AnyStyle };

/**
 * Resolve a named set of styles, once per theme, on first use - and once more
 * per breakpoint the set actually names, which is never for a set that names
 * none.
 *
 * Shaped like `StyleSheet.create` so it reads the way React Native already
 * does, but speaking the kit's vocabulary — shorthands, colour tokens and the
 * `/NN` alpha suffix — and returning one lowercase binding instead of a spread
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
 * The binding is a live view: reading `s.row` resolves against the ACTIVE
 * theme and breakpoint, and either swap hands back fresh objects (a new
 * identity is what makes react-native-web recompile them). Read properties off
 * it at render time; a value copied out and held keeps the theme it was read
 * under. Nothing here re-renders a component - a set that changes with the
 * breakpoint is read by one that follows it (`useBreakpoint`, or <Box>).
 */
export function styles<const S extends Record<string, StyleDecl>>(decls: S): Styles<S> {
  let builtAt = -1;
  let builtStep = 0;
  let breakpoints = 0;
  let built: Record<string, AnyStyle> = {};
  const resolve = (): Record<string, AnyStyle> => {
    const at = themeVersion();
    if (builtAt !== at || breakpointStep(breakpoints) !== builtStep) {
      const resolved: Record<string, AnyStyle> = {};
      breakpoints = 0;
      for (const name of Object.keys(decls)) {
        const decl = decls[name] as Record<string, unknown>;
        breakpoints |= declaredBreakpoints(decl);
        resolved[name] = stabilise(normalize(decl)) as AnyStyle;
      }
      built = resolved;
      builtAt = at;
      builtStep = breakpointStep(breakpoints);
    }
    return built;
  };
  return new Proxy({} as Styles<S>, {
    get: (_, key) => resolve()[key as string],
    has: (_, key) => (key as string) in resolve(),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_, key) => {
      const desc = Object.getOwnPropertyDescriptor(resolve(), key);
      return desc ? { ...desc, configurable: true } : undefined;
    },
    // A shared style must stay immutable, exactly as the frozen set used to be.
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

/** One style, for the handful of places a set of one would be noise. Resolved
 *  against the theme active at the first read — a caller that must follow a
 *  swap uses `styles()` and reads at render time. */
export function style<const T extends StyleDecl>(decl: T): AnyStyle {
  return styles({ only: decl }).only;
}

const shared = new Map<string, AnyStyle>();

const SHARED_LIMIT = 4096;

let sharedAt = -1;

/**
 * A style shared by identity with every caller passing the same `key`, for the
 * values a render computes rather than declares.
 *
 * Registered like `styles`, and shared by identity on top of that: styleq keys
 * its compiled-style cache on the leaf object, so resolving one per render is a
 * guaranteed miss even once the declaration compiles to a class.
 *
 * Capped, because a key built from a measured number would otherwise mint an
 * entry forever; past the cap it resolves correctly and stops remembering. A
 * theme swap clears it, which is also what retires the old theme's values.
 *
 * The key identifies the DECLARATION, so one stating a value per breakpoint
 * carries the step it was resolved at (see <Text>); the breakpoint is not part
 * of the key by itself, which is what keeps a flat declaration at one entry.
 */
export function sharedStyle(key: string, decl: StyleDecl): AnyStyle {
  const at = themeVersion();
  if (sharedAt !== at) {
    shared.clear();
    sharedAt = at;
  }
  const hit = shared.get(key);
  if (hit) return hit;
  const made = stabilise(normalize(decl as Record<string, unknown>)) as AnyStyle;
  if (shared.size < SHARED_LIMIT) shared.set(key, made);
  return made;
}
