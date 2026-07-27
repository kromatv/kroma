// Shared <Icon> logic: everything about a glyph that is not the glyph itself.
//
// Which component draws a name lives in icons/glyphs.ts. What is left here is
// the part the design owns: the default size, the default outline weight, and
// turning a palette token into a colour (React Native has no `currentColor` to
// inherit, so every glyph is told its colour explicitly).

import { type Glyph, glyphFor, type IconName } from '#ui/lib/icons/glyphs';
import { type ColorToken, colors } from './tokens';

export type { Glyph, IconName } from '#ui/lib/icons/glyphs';
export { hasGlyph, iconNames } from '#ui/lib/icons/glyphs';

export interface IconProps {
  name: IconName;
  /** Rendered size in px on the 1920x1080 design canvas. Default 24, Tabler's
   *  native grid, so the default needs no scaling at all. */
  size?: number;
  /** A palette token, or any raw colour string. Defaults to the body text colour
   *  because React Native has no `currentColor` to inherit. */
  color?: ColorToken | (string & {});
  /** Outline weight. Tabler draws at 2; the design thins it to 1.8 for the
   *  player transport. Ignored by the filled glyphs, which have no outline. */
  stroke?: number;
}

export interface ResolvedIcon {
  /** The component to draw, already narrowed to the shape every glyph shares. */
  Glyph: Glyph;
  size: number;
  /** The resolved colour, always OPAQUE: a filled glyph paints with it, an
   *  outline strokes. Any alpha the token carried is in `opacity`. */
  color: string;
  /** The alpha the colour carried, to be applied to the finished glyph rather
   *  than to its strokes. 1 for an opaque colour, which is most of them. */
  opacity: number;
  stroke: number;
}

export const DEFAULT_ICON_SIZE = 24;
export const DEFAULT_ICON_STROKE = 2;

/**
 * A colour split into an opaque paint and the alpha it carried.
 *
 * A Tabler glyph is SEVERAL stroked paths, and a translucent stroke composites
 * per path: wherever two of them cross - the slash of `volume-off` over its
 * speaker, the arcs of `volume` - the overlap comes out brighter than the rest
 * of the glyph, so `textDim` draws an icon that reads as two icons welded
 * together. Alpha therefore belongs to the glyph as a WHOLE: the paths draw
 * opaque, and `Icon` fades the finished glyph once (see icon.tsx).
 *
 * Anything not recognisably translucent is returned untouched at opacity 1, so
 * a raw colour string a caller invented still works.
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
  // #RRGGBBAA and #RGBA, where the alpha is simply the last channel.
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

// Icons re-render on every focus move in a 10-foot grid, and `textDim` /
// `textMuted` - the two commonest icon colours - are the ones that actually run
// `splitAlpha`'s regexes. The input space is the palette plus the handful of raw
// strings a caller invented, so memoising it outright is bounded and exact.
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
