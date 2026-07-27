// The icon set: all of Tabler, resolved by name, with a fallback.
//
// There is no list here and no generator. `<Icon name="wave-sine" />` finds
// `IconWaveSine` in the package, and a name the package does not have draws the
// fallback instead of crashing - which is what makes icon names safe to take
// from DATA (a server-installed module names its glyph in a manifest, a
// catalogue row can carry one), where no list could ever be complete.
//
// How one namespace serves a television and a browser
// ---------------------------------------------------
// Tabler ships the same icons twice, with the same export names: `@tabler/
// icons-react` draws DOM <svg>, `@tabler/icons-react-native` draws through
// react-native-svg. This file imports the React Native one; every web bundler
// aliases that specifier to the DOM one (clients/tv-build/rnw.ts, the same trick
// as `react-native` -> `react-native-web`). So a browser gets native SVG and
// never loads react-native-svg's runtime, and native gets react-native-svg,
// where it is the only way to draw at all. The one prop they spell differently
// is the outline weight; see stroke-prop.ts.
//
// What this costs, measured
// -------------------------
// A namespace import cannot be tree-shaken, so the whole set ships: the kit site
// went from 258 KB to 740 KB gzipped (850 KB -> 3.4 MB raw). Lazy loading does
// not recover it on the targets that care - Metro has no dynamic import with a
// computed specifier, and the webOS legacy tier inlines every chunk back into
// one IIFE - so it would only help the modern web tier, at the price of ~5800
// chunks and glyphs arriving over the network mid-render. The trade accepted
// here is bytes for the guarantee that any name resolves; going back to a
// hand-written map is a small, local change to this file alone.

import * as Tabler from '@tabler/icons-react-native';
import type { ComponentType } from 'react';

/** The two props both Tabler packages spell the same way. The outline weight is
 * the third the kit passes, but the packages disagree on its NAME, so it rides
 * in through `STROKE_PROP` rather than being declared here. */
type Glyph = ComponentType<{ size?: number; color?: string }>;

// ---- the name, derived from the package rather than declared ----
//
// `slugOf` below turns `IconWaveSine` into `wave-sine` at runtime. The types
// that follow do the SAME transform at compile time, over every name the
// package exports, so `IconName` is the real set of glyphs and a typo is a
// build error - without a list anywhere.

/** Digits, needed because a digit is neither upper nor lower case. */
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** `A` differs from its own lowercase; `a` and `2` do not. */
type IsUpper<C extends string> = C extends Lowercase<C> ? false : true;

/**
 * Where a hyphen goes, mirroring `slugOf`'s two boundaries exactly: before an
 * uppercase letter that follows a lowercase one or a digit (`WaveSine`), and
 * before a digit that follows a letter (`Volume2` -> `volume-2`). A digit
 * followed by a letter stays joined, because `Badge4k` is `badge-4k`.
 */
type NeedsDash<Prev extends string, C extends string> = Prev extends ''
  ? false
  : IsUpper<C> extends true
    ? IsUpper<Prev> extends true
      ? false
      : true
    : C extends Digit
      ? Prev extends Digit
        ? false
        : true
      : false;

/**
 * PascalCase to kebab-case, one character at a time.
 *
 * Tail-recursive on purpose: the accumulator keeps this inside TypeScript's
 * generous limit for tail calls (~1000) rather than the shallow one for nested
 * instantiation, which a 30-character icon name would otherwise threaten.
 */
type Kebab<
  S extends string,
  Prev extends string = '',
  Acc extends string = '',
> = S extends `${infer C}${infer Rest}`
  ? Kebab<Rest, C, `${Acc}${NeedsDash<Prev, C> extends true ? '-' : ''}${Lowercase<C>}`>
  : Acc;

/** The package's icon exports, which is every key shaped `Icon*` bar its types. */
type IconExport = Extract<keyof typeof Tabler, `Icon${string}`>;

/**
 * Every glyph name the kit can draw, in the design's own spelling.
 *
 * Distributive: each of the package's export names is converted on its own, so
 * this is the union of every Tabler slug. It gives editor completion for
 * thousands of glyphs and makes `<Icon name="chevron-rihgt" />` fail to compile,
 * which is the safety the old hand-written list used to provide and the reason it
 * existed at all.
 *
 * It is STRICT - no `| (string & {})` - because the whole app compiles against
 * it: nothing passes `<Icon name>` a value it cannot prove. A name that really
 * does arrive at runtime (a server-installed module naming its glyph in a
 * manifest) crosses into the type through `hasGlyph`, which narrows it, and
 * `glyphFor` still falls back if it is wrong.
 */
type IconName = IconExport extends `Icon${infer Rest}` ? Kebab<Rest> : never;

const EXPORTS = Tabler as unknown as Record<string, Glyph | undefined>;

/** `wave-sine` -> `IconWaveSine`, which is how Tabler names its exports. */
function exportName(slug: string): string {
  let out = 'Icon';
  for (const word of slug.split('-')) {
    out += word.charAt(0).toUpperCase() + word.slice(1);
  }
  return out;
}

/** Drawn in place of a name the package does not have. A missing glyph should
 * look missing, not take the screen down: `EXPORTS[unknown]` is `undefined`, and
 * rendering that as a component throws. */
const FALLBACK: Glyph = Tabler.IconHelpCircle;

/** Resolution is a string transform plus a property read, and icons re-render on
 * every focus move in a 10-foot grid, so the answer is remembered. Bounded by
 * the number of distinct names an app uses, which is dozens. */
const RESOLVED = new Map<string, Glyph>();

/** Takes a plain `string`, deliberately: this is the boundary where a name that
 * came from data stops being untyped, and it must be callable with whatever
 * arrived. An unknown name gets the fallback rather than an exception. */
function glyphFor(name: string): Glyph {
  const hit = RESOLVED.get(name);
  if (hit) return hit;
  const found = EXPORTS[exportName(name)];
  const glyph = typeof found === 'function' || typeof found === 'object' ? found : FALLBACK;
  RESOLVED.set(name, glyph);
  return glyph;
}

/**
 * True when the package really has this name — and a type guard, which is how a
 * runtime string becomes an `IconName` without a cast:
 *
 *   const raw = module.manifest.icon;
 *   if (hasGlyph(raw)) return <Icon name={raw} />;
 */
function hasGlyph(name: string): name is IconName {
  return Boolean(EXPORTS[exportName(name)]);
}

/**
 * `IconWaveSine` -> `wave-sine`, the design's spelling of the same glyph, and
 * the exact inverse of `exportName` (there is a test that round-trips them).
 *
 * Two boundaries, not one. The obvious one is lower-to-upper (`WaveSine`). The
 * other is letter-to-DIGIT: Tabler's slug for `IconVolume2` is `volume-2`, so
 * without it the gallery would list names that resolve to the fallback. A digit
 * followed by a letter stays joined, because `IconBadge4k` is `badge-4k`.
 */
function slugOf(name: string): string {
  return name
    .slice('Icon'.length)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

/**
 * Every name the package can draw, kebab-cased, sorted.
 *
 * This is thousands of entries, so it is computed once, lazily: the icon gallery
 * and the workbench's icon control are the only callers, and an app that never
 * opens the workbench should not walk the namespace at startup.
 */
let names: IconName[] | undefined;
function iconNames(): IconName[] {
  // The cast is the one place the runtime transform is trusted to agree with
  // the compile-time one. It is not taken on faith: `slugOf` and the `Kebab`
  // type are asserted against each other in glyphs.test.tsx.
  names ??= Object.keys(EXPORTS)
    .filter((key) => key.startsWith('Icon') && key !== 'IconProps')
    .map(slugOf)
    .sort((a, b) => a.localeCompare(b)) as IconName[];
  return names;
}

export type { Glyph, IconName };
export { exportName, FALLBACK, glyphFor, hasGlyph, iconNames, slugOf };
