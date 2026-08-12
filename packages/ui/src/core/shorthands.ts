// The shorthand vocabulary: the short names a style may be authored in, and the
// rule table that turns them into plain React Native longhands. Resolving a bag
// THROUGH the table is `shorthand-resolve.ts`.
//
// One table serves every consumer - <Box>'s props, <Text>'s props and a recipe's
// declarations - so `bg: 'surface1'` means the same thing wherever it is written.
// Each entry is one of four rule shapes:
//
//   'width'                    rename: the value passes through under this key
//   ['paddingLeft', ...]       expand: the value lands under every key
//   { flexDirection: 'row' }   flag: the object applies when the value is truthy
//   (value) => ({ ... })       compute: tokens resolve against the active theme
//
// TABLE ORDER IS THE CASCADE. A later rule's longhands overwrite an earlier
// one's, which is what makes `{ p: 20, pt: 4 }` resolve most-specific-wins no
// matter how the caller ordered the keys. Adding a shorthand is adding a row.
//
// Sizes are plain numbers, because every screen is authored on the fixed
// 1920x1080 canvas (see <TvStage>), so a number IS the design's px value. Only
// what genuinely is a token takes a name - and those resolve through the active
// theme, so a theme's palette or corner language reaches every declaration.

import type { DimensionValue, TextStyle, ViewStyle } from 'react-native';
import type { Responsive } from '#ui/core/breakpoint';
import { type ColorValue, color } from '#ui/core/color';
import { activeTheme, type RingToken, radiusValue } from '#ui/core/theme';
import { absoluteFill, type CornerValue, type ShadowToken } from '#ui/core/tokens';

// Every value below is {@link Responsive}: the value itself, or one per
// breakpoint (`px={{ base: 16, md: 40 }}`), which resolves through the same
// rules - a token named at `lg` is the same token named flat.
export type Spacing = Responsive<DimensionValue>;
export type Size = Responsive<DimensionValue>;
export type Flag = Responsive<boolean>;
export type Align = Responsive<NonNullable<ViewStyle['alignItems']>>;
export type Justify = Responsive<NonNullable<ViewStyle['justifyContent']>>;

export interface BoxStyleProps {
  flex?: Responsive<boolean | number>;
  row?: Flag;
  wrap?: Flag;
  center?: Flag;
  align?: Align;
  justify?: Justify;
  self?: Responsive<NonNullable<ViewStyle['alignSelf']>>;
  shrink?: Responsive<number>;
  grow?: Responsive<number>;
  basis?: Size;
  gap?: Spacing;
  /** The gap along one axis only, for a wrapping row whose columns and rows
   *  breathe differently. Both are real React Native style keys, so they mean
   *  the same thing on every target. */
  gapX?: Spacing;
  gapY?: Spacing;
  /** How WRAPPED lines are packed against the cross axis. `align` positions the
   *  items inside their line; this positions the lines. */
  alignContent?: Responsive<NonNullable<ViewStyle['alignContent']>>;
  between?: Flag;

  w?: Size;
  h?: Size;
  minW?: Size;
  minH?: Size;
  maxW?: Size;
  maxH?: Size;
  aspect?: Responsive<number>;

  fill?: Flag;
  absolute?: Flag;
  top?: Size;
  right?: Size;
  bottom?: Size;
  left?: Size;
  z?: Responsive<number>;

  p?: Spacing;
  px?: Spacing;
  py?: Spacing;
  pt?: Spacing;
  pr?: Spacing;
  pb?: Spacing;
  pl?: Spacing;
  m?: Spacing;
  mx?: Spacing;
  my?: Spacing;
  mt?: Spacing;
  mr?: Spacing;
  mb?: Spacing;
  ml?: Spacing;

  bg?: Responsive<ColorValue>;
  /** A radius token, a raw px value, or `'circle'`; see {@link CornerValue}. */
  radius?: Responsive<CornerValue>;
  border?: Responsive<ColorValue>;
  borderWidth?: Responsive<number>;
  shadow?: Responsive<ShadowToken>;
  /** The focus treatment, derived from the theme's accent. */
  ring?: Responsive<RingToken>;
  opacity?: Responsive<number>;
  overflow?: Responsive<NonNullable<ViewStyle['overflow']>>;
  /** Paints into its own stacking context, so a blend or a z-index inside cannot
   *  reach the page behind it. Browser targets only; native has no equivalent. */
  isolate?: Flag;
}

/** The rows a React Native <Text> honours: it lays ITSELF out, so the container
 *  rows (`row`, `gap`, `align`) and the surface paints (`bg`, `radius`, `border`)
 *  stay on <Box>. */
const TEXT_LAYOUT_ROWS = [
  'flex',
  'self',
  'shrink',
  'grow',
  'basis',
  'w',
  'h',
  'minW',
  'minH',
  'maxW',
  'maxH',
  'absolute',
  'top',
  'right',
  'bottom',
  'left',
  'z',
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
  'opacity',
] as const satisfies readonly (keyof BoxStyleProps)[];

/**
 * The text half of the layout vocabulary: what <Text> takes as props.
 *
 * `textAlign` is spelled in full because `align` already means `alignItems` on
 * <Box>, and one name means one role across the kit.
 */
export interface TextLayoutProps extends Pick<BoxStyleProps, (typeof TEXT_LAYOUT_ROWS)[number]> {
  textAlign?: Responsive<NonNullable<TextStyle['textAlign']>>;
}

export type Rule =
  | string
  | readonly string[]
  | Readonly<Record<string, unknown>>
  | ((value: unknown) => Readonly<Record<string, unknown>>);

/**
 * The `satisfies` below is what makes the interfaces and the table one source of
 * truth: a prop added to `BoxStyleProps` or `TextLayoutProps` and forgotten here
 * is a compile error. Without that link they drift silently and in two different
 * ways - <Box> and <Text> forward the unknown name to the host node as a DOM
 * attribute, and a recipe emits it verbatim as a bogus style key.
 */
export const RULES = {
  // First, so anything after can override an edge of it.
  fill: absoluteFill,

  flex: (v) => ({ flex: v === true ? 1 : v }),
  row: { flexDirection: 'row' },
  wrap: { flexWrap: 'wrap' },
  center: { alignItems: 'center', justifyContent: 'center' },
  between: { justifyContent: 'space-between' },
  align: 'alignItems',
  justify: 'justifyContent',
  self: 'alignSelf',
  shrink: 'flexShrink',
  grow: 'flexGrow',
  basis: 'flexBasis',
  gap: 'gap',
  gapX: 'columnGap',
  gapY: 'rowGap',
  alignContent: 'alignContent',

  w: 'width',
  h: 'height',
  minW: 'minWidth',
  minH: 'minHeight',
  maxW: 'maxWidth',
  maxH: 'maxHeight',
  aspect: 'aspectRatio',

  absolute: { position: 'absolute' },
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  z: 'zIndex',

  // Longhands only, never `padding`: React Native resolves shorthand vs
  // longhand by declaration order inside one object, so a `{ padding,
  // paddingTop }` pair is surprising. All, then axis, then side.
  p: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
  pt: 'paddingTop',
  pr: 'paddingRight',
  pb: 'paddingBottom',
  pl: 'paddingLeft',
  m: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'],
  mx: ['marginLeft', 'marginRight'],
  my: ['marginTop', 'marginBottom'],
  mt: 'marginTop',
  mr: 'marginRight',
  mb: 'marginBottom',
  ml: 'marginLeft',

  bg: (v) => ({ backgroundColor: color(v as string) }),
  radius: (v) => ({ borderRadius: radiusValue(v as CornerValue) }),
  // Before `borderWidth`, so an explicit width always beats the hairline.
  border: (v) => ({ borderColor: color(v as string), borderWidth: 1 }),
  borderWidth: 'borderWidth',
  shadow: (v) => ({ boxShadow: activeTheme().shadow[v as ShadowToken] }),
  // Guarded: <Focusable> has its own boolean `ring` prop, and a spread bag must
  // not smuggle it in as a paint.
  ring: (v) => (typeof v === 'string' ? { ...activeTheme().ring[v as RingToken] } : {}),
  opacity: 'opacity',
  overflow: 'overflow',
  isolate: { isolation: 'isolate' },
  textAlign: 'textAlign',
} as const satisfies Record<keyof BoxStyleProps | keyof TextLayoutProps, Rule>;

export const RULE_KEYS = Object.keys(RULES) as (keyof typeof RULES)[];

/** The shorthand names as a lookup, shared by <Box>'s prop split and the
 *  resolver. */
export const BOX_STYLE_PROPS: ReadonlySet<string> = new Set(RULE_KEYS);

/** The subset <Text> speaks, in the table's own cascade order. */
export const TEXT_STYLE_PROPS: ReadonlySet<string> = new Set([
  ...TEXT_LAYOUT_ROWS,
  'textAlign',
] as string[]);
