// Shared <Icon> logic: the default size and outline weight, and turning a palette
// token into a colour. Which component draws a name lives in icons/glyphs.ts.

import { type Glyph, glyphFor, type IconName } from '#ui/lib/icons/glyphs';
import { type ColorToken, colors } from './tokens';

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
  opacity: number;
  stroke: number;
}

export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_STROKE = 2;

/**
 * A colour split into an opaque paint and the alpha it carried, because a translucent
 * stroke composites per path and a glyph's crossings would come out brighter. Anything
 * not recognisably translucent comes back untouched at opacity 1.
 */
export function splitAlpha(color: string): { color: string; opacity: number } {
  const body = /^rgba?\((.+)\)$/i.exec(color)?.[1];
  if (body) {
    // Both spellings, `rgba(r, g, b, a)` and the newer `rgb(r g b / a)`.
    const parts = body.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return { color, opacity: 1 };
    const raw = parts[3] as string;
    const alpha = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    if (!Number.isFinite(alpha)) return { color, opacity: 1 };
    return { color: `rgb(${parts.slice(0, 3).join(', ')})`, opacity: alpha };
  }
  const hex = /^#(?:([0-9a-f]{3})([0-9a-f])|([0-9a-f]{6})([0-9a-f]{2}))$/i.exec(color);
  if (hex) {
    const short = hex[1] !== undefined;
    const raw = (short ? hex[2] : hex[4]) as string;
    return {
      color: `#${short ? hex[1] : hex[3]}`,
      opacity: Number.parseInt(raw, 16) / (short ? 15 : 255),
    };
  }
  return { color, opacity: 1 };
}

// Icons re-render on every focus move, and the input space is the palette plus a
// handful of raw strings, so memoising outright stays bounded.
const paints = new Map<string, { color: string; opacity: number }>();

function paintFor(color: string): { color: string; opacity: number } {
  const hit = paints.get(color);
  if (hit) return hit;
  const paint = splitAlpha(color);
  paints.set(color, paint);
  return paint;
}

export function resolveIcon({
  name,
  size = DEFAULT_ICON_SIZE,
  color = 'text',
  stroke = DEFAULT_ICON_STROKE,
}: Readonly<IconProps>): ResolvedIcon {
  const paint = paintFor((colors as Record<string, string>)[color] ?? color);
  return {
    Glyph: glyphFor(name),
    size,
    color: paint.color,
    opacity: paint.opacity,
    stroke,
  };
}
