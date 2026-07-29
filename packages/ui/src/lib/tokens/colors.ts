// KROMA colour tokens. THIS FILE IS THE SINGLE SOURCE OF TRUTH: the CSS custom
// properties in packages/ui/src/styles/tokens/colors.css are GENERATED from it
// (`bun run --filter '@kroma/tv-kit' gen:css`). Never edit the .css by hand.
//
// Values are plain strings so they drop straight into a React Native StyleSheet
// and into CSS alike. No color-mix()/oklch(): those cannot be expressed in RN,
// and the old webOS tier could not parse them either.

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

  /* Text on dark */
  text: '#F4F3F0',
  textMuted: 'rgba(244, 243, 240, 0.62)',
  textDim: 'rgba(244, 243, 240, 0.45)',

  /* Brand accent: warm amber */
  accent: '#F4B642',
  accentHover: '#FFC862',
  accentBright: '#FFD262',
  accentInk: '#0A0A0C',
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
  danger: '#E53935',
  /** The lit step of `danger`, for the same job `accentHover` does for the
   *  accent: a pointer resting on a destructive button. A LIGHTER red rather
   *  than a darker one - a hover has to read as the control coming forward, and
   *  every other variant's hover brightens too. */
  dangerHover: '#EF5350',
} as const;

export type ColorToken = keyof typeof colors;

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
