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
// `style` is loose for the same reason: the DOM build takes CSSProperties, the
// native one react-native-svg's style, and both spread it onto their root.
type Glyph = ComponentType<{ size?: number; color?: string; style?: object; className?: string }>;

/** Glyphs keyed by Tabler's own export name (`IconWaveSine`): a namespace of the
 * package, or any part of one. */
type GlyphExports = Readonly<Record<string, unknown>>;

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

/** Two boundaries: lower-to-upper, and letter-to-digit (`IconVolume2` -> `volume-2`).
 * A digit followed by a letter stays joined (`IconBadge4k`). */
function slugOf(name: string): string {
  return name
    .slice('Icon'.length)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase();
}

/** Build a lookup once; resolution never mutates a module or another root. */
function createGlyphSet(exports: GlyphExports) {
  const glyphs = exports as Readonly<Record<string, Glyph | undefined>>;
  const names = Object.freeze(
    Object.keys(glyphs)
      .filter((key) => key.startsWith('Icon') && key !== 'IconProps')
      .map(slugOf)
      .sort((a, b) => a.localeCompare(b)) as IconName[],
  );
  // Resolve by export name as before, while keeping lookups constant-time.
  const byName = Object.freeze(
    Object.fromEntries(
      names.map((name) => {
        const found = glyphs[exportName(name)];
        return [
          name,
          typeof found === 'function' || (found != null && typeof found === 'object')
            ? found
            : FALLBACK,
        ];
      }),
    ),
  );
  return Object.freeze({
    glyphFor: (name: string): Glyph =>
      (Object.hasOwn(byName, name) ? byName[name] : undefined) ?? FALLBACK,
    hasGlyph: (name: string): name is IconName => Boolean(glyphs[exportName(name)]),
    iconNames: (): readonly IconName[] => names,
  });
}
const BUILTIN_GLYPHS = createGlyphSet(RAW);
const { glyphFor, hasGlyph, iconNames } = BUILTIN_GLYPHS;

export type { Glyph, GlyphExports, IconName };
export {
  BUILTIN_GLYPHS,
  createGlyphSet,
  exportName,
  FALLBACK,
  glyphFor,
  hasGlyph,
  iconNames,
  RAW,
  slugOf,
};
