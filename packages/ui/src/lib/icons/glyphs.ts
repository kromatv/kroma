// The icon set: all of Tabler, resolved by name at runtime, with a fallback, so
// an icon name can safely come from data (a module manifest, a catalogue row).

// Type-only import: erased at build time, so `IconName` covers every Tabler name
// without pulling any of them into the bundle. The runtime set comes from
// ./glyph-source, which a TV shell swaps for a scanned subset.
import type * as Tabler from '@tabler/icons-react-native';
import type { ComponentType } from 'react';
import { FALLBACK, EXPORTS as RAW } from './glyph-source';

type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type IsUpper<C extends string> = C extends Lowercase<C> ? false : true;

// Mirrors `slugOf`'s two boundaries: before an uppercase letter following a
// lowercase one or a digit, and before a digit following a letter. A digit
// followed by a letter stays joined (`Badge4k` -> `badge-4k`).
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

// Tail-recursive: stays under TypeScript's tail-call limit (~1000) rather than
// the much shallower nested-instantiation one.
type Kebab<
  S extends string,
  Prev extends string = '',
  Acc extends string = '',
> = S extends `${infer C}${infer Rest}`
  ? Kebab<Rest, C, `${Acc}${NeedsDash<Prev, C> extends true ? '-' : ''}${Lowercase<C>}`>
  : Acc;

type IconExport = Extract<keyof typeof Tabler, `Icon${string}`>;

// The outline weight is the third prop the kit passes, but the two Tabler
// packages disagree on its name, so it rides in through `STROKE_PROP` instead.
type Glyph = ComponentType<{ size?: number; color?: string }>;

/** Glyphs keyed by Tabler's own export name (`IconWaveSine`): a namespace of the
 * package, or any part of one. */
type GlyphExports = Readonly<Record<string, unknown>>;

let glyphs = RAW as unknown as Record<string, Glyph | undefined>;

/** Every glyph name the kit can draw, in the design's own spelling. Strict:
 * a typo fails to compile; a name from data crosses in through `hasGlyph`. */
type IconName = IconExport extends `Icon${infer Rest}` ? Kebab<Rest> : never;

function exportName(slug: string): string {
  let out = 'Icon';
  for (const word of slug.split('-')) {
    out += word.charAt(0).toUpperCase() + word.slice(1);
  }
  return out;
}

// Icons re-render on every focus move in a 10-foot grid, so resolution is
// memoized; bounded by the distinct names an app uses.
const RESOLVED = new Map<string, Glyph>();

/** Takes a plain `string`: an unknown name gets the fallback rather than an exception. */
function glyphFor(name: string): Glyph {
  const hit = RESOLVED.get(name);
  if (hit) return hit;
  const found = glyphs[exportName(name)];
  const glyph = typeof found === 'function' || typeof found === 'object' ? found : FALLBACK;
  RESOLVED.set(name, glyph);
  return glyph;
}

function hasGlyph(name: string): name is IconName {
  return Boolean(glyphs[exportName(name)]);
}

/** Two boundaries: lower-to-upper, and letter-to-digit (`IconVolume2` -> `volume-2`).
 * A digit followed by a letter stays joined (`IconBadge4k`). */
function slugOf(name: string): string {
  return name
    .slice('Icon'.length)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

/** Every name the package can draw, kebab-cased, sorted. Thousands of entries,
 * so it's computed once, lazily. */
let names: IconName[] | undefined;
function iconNames(): IconName[] {
  // `slugOf` and the `Kebab` type are asserted against each other in glyphs.test.tsx.
  names ??= Object.keys(glyphs)
    .filter((key) => key.startsWith('Icon') && key !== 'IconProps')
    .map(slugOf)
    .sort((a, b) => a.localeCompare(b)) as IconName[];
  return names;
}

/** Widens the set every lookup here answers from, past the glyphs the build
 * kept. Only a workbench browsing all of Tabler fetches them: see
 * `lib/icons/library`. */
function addGlyphs(more: GlyphExports): void {
  glyphs = { ...glyphs, ...(more as Record<string, Glyph | undefined>) };
  RESOLVED.clear();
  names = undefined;
}

export type { Glyph, GlyphExports, IconName };
export { addGlyphs, exportName, FALLBACK, glyphFor, hasGlyph, iconNames, slugOf };
