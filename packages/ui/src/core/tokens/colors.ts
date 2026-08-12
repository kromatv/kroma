// KROMA colour tokens. THIS FILE IS THE SINGLE SOURCE OF TRUTH: kromaUI()
// (@kroma/ui/vite) emits the CSS custom properties from it at build time, so
// there is no stylesheet copy to edit or to keep in step.
//
// Values are plain strings so they drop straight into a React Native StyleSheet
// and into CSS alike. No color-mix()/oklch(): those cannot be expressed in RN,
// and the old webOS tier could not parse them either.

import type { TokenOf } from './registry';
export const colors = {
  /* Surfaces: deep cinematic charcoal */
  bg: '#0A0A0C',
  surface1: '#121216',
  surface2: '#1C1C22',
  surface3: '#26262E',
  overlay: 'rgba(18, 18, 22, 0.86)',
  border: 'rgba(255, 255, 255, 0.08)',
  /** The wash a loading placeholder pulses between. Named because it is used by
   *  BOTH skeletons - the kit's (React Native) and the admin contract's (a
   *  Tailwind div) - and a wash that differs between them is a visible seam. */
  wash: 'rgba(255, 255, 255, 0.06)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  /** The direction a wash moves in: lighter on a dark ground, darker on paper. */
  tint: '#FFFFFF',

  /* Text on dark */
  text: '#F4F3F0',
  textMuted: 'rgba(244, 243, 240, 0.62)',
  textDim: 'rgba(244, 243, 240, 0.48)',
  /** `textMuted` and `textDim` as SOLID ink, already blended over the page
   *  ground, for anything that must not carry an alpha: a translucent stroke
   *  composites once per path, so a glyph's crossings come out brighter. */
  glyph: '#9B9B99',
  glyphDim: '#7A7A79',

  /* Brand accent: warm amber */
  accent: '#F4B642',
  accentHover: '#FFC862',
  /** The step UNDER the finger: deeper than rest, where hover is lighter. */
  accentPress: '#DFA436',
  accentBright: '#FFD262',
  accentInk: '#0A0A0C',
  /** The accent as INK rather than as a fill: it has to clear text contrast on
   *  the page ground, which the fill hue does not on paper. */
  accentText: '#F4B642',
  /** The soft-amber base. A different hue from `accent` (244, 182, 66): every
   *  wash, glow and edge in the accent family is built on this one, so it is a
   *  token rather than eight hand-written rgba() literals. */
  accentWash: '#F2B442',
  accentSoft: 'rgba(242, 180, 66, 0.16)',
  /** The lit step of `accentSoft`: a pointer resting on a toggle that is already
   *  ON. It has to stay AMBER - the white wash the idle controls hover with
   *  would wipe the accent off and read as the toggle switching itself back
   *  off - so the ladder is soft → softHover, the same shape as accent →
   *  accentHover. */
  accentSoftHover: 'rgba(242, 180, 66, 0.26)',

  /* Semantic + quality badges */
  success: '#46D08D',
  info: '#86A8FF',
  hdr: '#C792EA',
  h265: '#5FD3C4',
  danger: '#E8536A',
  /** The lit step of `danger`, for the same job `accentHover` does for the
   *  accent: a pointer resting on a destructive button. A LIGHTER red rather
   *  than a darker one - a hover has to read as the control coming forward, and
   *  every other variant's hover brightens too. */
  dangerHover: '#EF8091',
  /** See `accentPress`. */
  dangerPress: '#D43E55',
} as const;

/** The light palette. `accent` deepens because one token is both fill and text,
 *  and `accentInk` flips with it. */
export const lightColors: Record<keyof typeof colors, string> = {
  bg: '#F7F5F1',
  surface1: '#FFFEFB',
  surface2: '#F0EDE6',
  surface3: '#E6E2DA',
  overlay: 'rgba(247, 245, 241, 0.88)',
  border: 'rgba(10, 10, 12, 0.11)',
  wash: 'rgba(10, 10, 12, 0.05)',
  borderStrong: 'rgba(10, 10, 12, 0.2)',
  tint: '#0A0A0C',

  text: '#16151A',
  textMuted: 'rgba(22, 21, 26, 0.66)',
  textDim: 'rgba(22, 21, 26, 0.60)',
  glyph: '#636163',
  glyphDim: '#706F70',

  accent: '#F4B642',
  accentHover: '#E0A32E',
  accentPress: '#C98D1F',
  accentBright: '#FFC862',
  accentInk: '#0A0A0C',
  accentText: '#8A5A05',
  accentWash: '#B8811F',
  accentSoft: 'rgba(184, 129, 31, 0.18)',
  accentSoftHover: 'rgba(184, 129, 31, 0.28)',

  success: '#136B41',
  info: '#2F4FAE',
  hdr: '#6B3E9E',
  h265: '#106A5E',
  danger: '#A62035',
  dangerHover: '#8C1A2C',
  dangerPress: '#711221',
};

/**
 * Names a theme adds to the palette, Tailwind-4 style: augment it once and the
 * name is legal everywhere a colour is written (`bg`, `border`, `color`, the
 * `/NN` alpha suffix) with the value supplied through `createTheme`.
 *
 *   declare module '@kroma/ui/tokens/colors' {
 *     interface ColorRegistry { brand: string }
 *   }
 */
// biome-ignore lint/suspicious/noEmptyInterface: an augmentation point is empty by design
export interface ColorRegistry {}

export type ColorToken = TokenOf<typeof colors, ColorRegistry>;

/**
 * Chart series colours, in assignment order.
 *
 * A DATA palette, which is a different job from the badge colours above: those
 * only have to be legible on their own, while these have to stay tellable apart
 * from each other, including by a colourblind reader, on the surface they are
 * drawn on. So they are not eyeballed - the set is checked against the six
 * standard palette checks (OKLCH lightness band, chroma floor, adjacent CVD
 * separation under protan/deutan/tritan, normal-vision separation, and contrast
 * against the surface) and passes all of them on the player's stats card in both
 * the darkest and the brightest frame it can sit over.
 *
 * Assign by POSITION and never cycle: a reader who learned that blue is
 * bandwidth must not find it repainted when a series drops out.
 *
 * THREE slots, and that is a measured limit rather than a placeholder. The band
 * the checks leave usable here is narrow - deeper than the badge palette, because
 * a 2px trace reads lighter than a filled pill of the same hue and the light end
 * is where CVD separation fails - and no fourth hue fits in it: every candidate
 * tried collapsed against blue or against green under deutan/protan (best was
 * ΔE 6.7, inside the 6-8 floor band). So a fourth series does not get a fourth
 * colour. It gets its own chart, which is the correct answer anyway - facet
 * rather than invent a hue that a colourblind reader cannot separate.
 */
export const SERIES_COLORS = ['#3B7FD4', '#C08420', '#2E9E6E'] as const;

/** The chromatic wheel of the KROMA mark, in segment order. */
export const WHEEL_COLORS = [
  '#F2685C',
  '#F4B642',
  '#5FBF8F',
  '#4F9DE0',
  '#6366F1',
  '#A855F7',
] as const;

/** Billboard / poster shade stops (transparent to page background). Used by the
 * hero gradients, which are a LinearGradient on native and on web alike. */
export const SHADE = {
  transparent: 'rgba(10, 10, 12, 0)',
  mid: 'rgba(10, 10, 12, 0.55)',
  full: '#0A0A0C',
} as const;

/** The page background (`colors.bg`) at an arbitrary alpha, for the hand-tuned
 * veil gradients whose stops fall between {@link SHADE}'s three. */
export function shade(alpha: number): string {
  return `rgba(10, 10, 12, ${alpha})`;
}

const CUSTOM_PROPERTY = /^var\((--[a-z0-9-]+)\)$/;

/** A colour that is not `#RGB`/`#RRGGBB` is returned untouched rather than
 *  guessed at, so `withAlpha('transparent', 0.5)` is a no-op.
 *
 * A custom property resolves to the sibling property the build emits for that
 * step: fading one in place would need `color-mix()`, which neither React
 * Native nor the legacy webOS tier can parse. */
export function withAlpha(value: string, alpha: number): string {
  const property = CUSTOM_PROPERTY.exec(value)?.[1];
  if (property) {
    const step = String(Number((alpha * 100).toFixed(4))).replace('.', '_');
    return `var(${property}-${step})`;
  }
  return withHexAlpha(value, alpha);
}

function withHexAlpha(value: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value)?.[1];
  if (!hex) return value;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(alpha.toFixed(4))})`;
}

/**
 * The inverse of {@link withAlpha}: a colour split into an opaque paint and the
 * alpha it carried. Anything not recognisably translucent comes back untouched
 * at opacity 1.
 */
export function splitAlpha(value: string): { color: string; opacity: number } {
  const body = /^rgba?\((.+)\)$/i.exec(value)?.[1];
  if (body) {
    // Both spellings, `rgba(r, g, b, a)` and the newer `rgb(r g b / a)`.
    const parts = body.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 4) return { color: value, opacity: 1 };
    const raw = parts[3] as string;
    const alpha = raw.endsWith('%') ? Number(raw.slice(0, -1)) / 100 : Number(raw);
    if (!Number.isFinite(alpha)) return { color: value, opacity: 1 };
    return { color: `rgb(${parts.slice(0, 3).join(', ')})`, opacity: alpha };
  }
  const hex = /^#(?:([0-9a-f]{3})([0-9a-f])|([0-9a-f]{6})([0-9a-f]{2}))$/i.exec(value);
  if (hex) {
    const short = hex[1] !== undefined;
    const raw = (short ? hex[2] : hex[4]) as string;
    return {
      color: `#${short ? hex[1] : hex[3]}`,
      opacity: Number.parseInt(raw, 16) / (short ? 15 : 255),
    };
  }
  return { color: value, opacity: 1 };
}
