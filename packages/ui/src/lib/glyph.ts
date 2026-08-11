// Shared <Icon> logic: the default size and outline weight, and turning a palette
// token into a colour. Which component draws a name lives in icons/glyphs.ts.

import { color as resolveColor, themeVersion } from '#ui/core';
import type { ColorToken } from '#ui/core/tokens';
import { splitAlpha } from '#ui/core/tokens/colors';
import { CSS_FADED } from '#ui/core/tokens/css-palette';
import { type Glyph, glyphFor, type IconName } from '#ui/lib/icons/glyphs';

export type { Glyph, IconName } from '#ui/lib/icons/glyphs';
export { hasGlyph, iconNames } from '#ui/lib/icons/glyphs';

export interface IconProps {
  name: IconName;
  size?: number;
  /** Explicit because React Native has no `currentColor` to inherit. */
  color?: ColorToken | (string & {});
  stroke?: number;
}

export interface ResolvedIcon {
  Glyph: Glyph;
  size: number;
  /** Always OPAQUE; any alpha the token carried is in `opacity`. */
  color: string;
  /** A custom property where the ground decides the alpha (see `CSS_FADED`). */
  opacity: number | string;
  stroke: number;
}

export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_STROKE = 2;

type Paint = { color: string; opacity: number | string };

// A custom property is opaque to `splitAlpha`, so a token that resolves to one
// is looked up rather than parsed.
function cascadePaint(authored: string): Paint | null {
  const faded = CSS_FADED[authored];
  if (faded) return faded;
  const slash = authored.lastIndexOf('/');
  if (slash === -1) return null;
  const base = authored.slice(0, slash);
  const alpha = Number(authored.slice(slash + 1));
  if (CSS_FADED[base] || !Number.isFinite(alpha)) return null;
  const color = resolveColor(base);
  return color.startsWith('var(') ? { color, opacity: alpha / 100 } : null;
}

// Icons re-render on every focus move, and the input space is the palette plus a
// handful of raw strings, so memoising outright stays bounded. A theme swap
// clears it, since the names resolve through the active palette.
const paints = new Map<string, Paint>();

let paintsAt = -1;

function paintFor(authored: string): Paint {
  const at = themeVersion();
  if (paintsAt !== at) {
    paints.clear();
    paintsAt = at;
  }
  const hit = paints.get(authored);
  if (hit) return hit;
  const paint = cascadePaint(authored) ?? splitAlpha(resolveColor(authored));
  paints.set(authored, paint);
  return paint;
}

export function resolveIcon({
  name,
  size = DEFAULT_ICON_SIZE,
  color = 'text',
  stroke = DEFAULT_ICON_STROKE,
}: Readonly<IconProps>): ResolvedIcon {
  const paint = paintFor(color);
  return {
    Glyph: glyphFor(name),
    size,
    color: paint.color,
    opacity: paint.opacity,
    stroke,
  };
}
