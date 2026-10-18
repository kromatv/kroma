// Shared <Icon> logic: the default size and outline weight, and turning a palette
// token into a colour. Which component draws a name lives in icons/glyphs.ts.

import {
  activeTheme,
  DEFAULT_STYLE_SCOPE,
  color as resolveColor,
  type StyleScope,
  themedCache,
} from '#ui/core';
import type { ColorToken } from '#ui/core/tokens';
import { splitAlpha } from '#ui/core/tokens/colors';
import { CSS_FADED } from '#ui/core/tokens/css-palette';
import { type Glyph, glyphFor, type IconName } from '#ui/lib/icons/glyphs';

export type { Glyph, GlyphExports, IconName } from '#ui/lib/icons/glyphs';
export { hasGlyph, iconNames } from '#ui/lib/icons/glyphs';

export interface IconProps {
  name: IconName;
  size?: number;
  /** Explicit because React Native has no `currentColor` to inherit. */
  color?: ColorToken | (string & {});
  /** Outline weight in px, constant across sizes. Defaults to 2. */
  thickness?: number;
}

export interface ResolvedIcon {
  Glyph: Glyph;
  size: number;
  /** Always OPAQUE; any alpha the token carried is in `opacity`. */
  color: string;
  /** A custom property where the ground decides the alpha (see `CSS_FADED`). */
  opacity: number | string;
  thickness: number;
}

export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_THICKNESS = 2;

type Paint = { color: string; opacity: number | string };

// A custom property is opaque to `splitAlpha`, so a token that resolves to one
// is looked up rather than parsed.
function cascadePaint(authored: string, scope: StyleScope): Paint | null {
  const faded = CSS_FADED[authored];
  if (faded) return faded;
  const slash = authored.lastIndexOf('/');
  if (slash === -1) return null;
  const base = authored.slice(0, slash);
  const alpha = Number(authored.slice(slash + 1));
  if (CSS_FADED[base] || !Number.isFinite(alpha)) return null;
  const color = resolveColor(base, activeTheme(scope.theme));
  return color.startsWith('var(') ? { color, opacity: alpha / 100 } : null;
}

// Icons re-render on every focus move, and the input space is the palette plus a
// handful of raw strings, so memoising outright stays bounded.
const paints = new WeakMap<StyleScope, ReturnType<typeof themedCache<Paint>>>();

function paintFor(authored: string, scope: StyleScope): Paint {
  let cache = paints.get(scope);
  if (!cache) {
    cache = themedCache<Paint>(4096, scope.theme);
    paints.set(scope, cache);
  }
  return cache(
    authored,
    () =>
      cascadePaint(authored, scope) ?? splitAlpha(resolveColor(authored, activeTheme(scope.theme))),
  );
}

export function resolveIcon(
  {
    name,
    size = DEFAULT_ICON_SIZE,
    color = 'text',
    thickness = DEFAULT_ICON_THICKNESS,
  }: Readonly<IconProps>,
  lookup: (name: string) => Glyph = glyphFor,
  scope: StyleScope = DEFAULT_STYLE_SCOPE,
): ResolvedIcon {
  const paint = paintFor(color, scope);
  return {
    Glyph: lookup(name),
    size,
    color: paint.color,
    opacity: paint.opacity,
    thickness,
  };
}
