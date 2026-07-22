// Kroma mobile design tokens, mirroring packages/ui/src/styles/tokens/colors.css
// (deep cinematic charcoal surfaces + the warm amber brand accent) and the
// chromatic wheel from scripts/brand/gen-brand-assets.ts.

export const colors = {
  bg: '#0A0A0C',
  surface: '#121216',
  surfaceRaised: '#1C1C22',
  surfaceHigh: '#26262E',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  overlay: 'rgba(18, 18, 22, 0.86)',
  text: '#F4F3F0',
  textDim: 'rgba(244, 243, 240, 0.62)',
  textFaint: 'rgba(244, 243, 240, 0.45)',
  accent: '#F4B642',
  accentBright: '#FFD262',
  accentSoft: 'rgba(242, 180, 66, 0.16)',
  accentInk: '#0A0A0C',
  success: '#46D08D',
  info: '#86A8FF',
  danger: '#E53935',
} as const;

export const WHEEL_COLORS = [
  '#F2685C',
  '#F4B642',
  '#5FBF8F',
  '#4F9DE0',
  '#6366F1',
  '#A855F7',
] as const;

/** Billboard / poster shade stops (transparent -> page background). */
export const SHADE = {
  transparent: 'rgba(10, 10, 12, 0)',
  mid: 'rgba(10, 10, 12, 0.55)',
  full: '#0A0A0C',
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 28,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** RN 0.86 dropped StyleSheet.absoluteFillObject; local equivalent. */
export const absoluteFill = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

export const type = {
  display: { fontSize: 34, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.8 },
  title: { fontSize: 28, fontWeight: '800' as const, color: colors.text, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  section: { fontSize: 18, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textDim },
  small: { fontSize: 11, fontWeight: '600' as const, color: colors.textFaint },
} as const;

/** Height of the floating (translucent) tab bar; tab screens pad their scroll
 * content by this so the last row clears it. */
export const TAB_BAR_CLEARANCE = 108;

/** Poster card sizing: phones get ~3 columns, tablets scale up. */
export function posterWidth(windowWidth: number): number {
  let cols = 3;
  if (windowWidth >= 900) cols = 6;
  else if (windowWidth >= 600) cols = 4;
  return Math.floor((windowWidth - 16 * 2 - 12 * (cols - 1)) / cols);
}
