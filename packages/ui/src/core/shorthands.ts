// The shorthand vocabulary: the short names a style may be authored in, and the
// rule table that turns them into plain React Native longhands.
//
// One table serves both consumers - <Box>'s props and a recipe's declarations -
// so `bg: 'surface1'` means the same thing wherever it is written. Each entry is
// one of four rule shapes:
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

import type { DimensionValue, ViewStyle } from 'react-native';
import { type ColorValue, color } from '#ui/core/color';
import { activeTheme, type RingToken } from '#ui/core/theme';
import {
  absoluteFill,
  type FontToken,
  type RadiusToken,
  type ShadowToken,
  type TypeRole,
} from '#ui/core/tokens';

export type Spacing = DimensionValue;
export type Align = ViewStyle['alignItems'];
export type Justify = ViewStyle['justifyContent'];

export interface BoxStyleProps {
  flex?: boolean | number;
  row?: boolean;
  wrap?: boolean;
  center?: boolean;
  align?: Align;
  justify?: Justify;
  self?: NonNullable<ViewStyle['alignSelf']>;
  shrink?: number;
  grow?: number;
  gap?: Spacing;
  between?: boolean;

  w?: DimensionValue;
  h?: DimensionValue;
  minW?: DimensionValue;
  minH?: DimensionValue;
  maxW?: DimensionValue;
  maxH?: DimensionValue;
  aspect?: number;

  fill?: boolean;
  absolute?: boolean;
  top?: DimensionValue;
  right?: DimensionValue;
  bottom?: DimensionValue;
  left?: DimensionValue;
  z?: number;

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

  bg?: ColorValue;
  radius?: RadiusToken | number;
  border?: ColorValue;
  borderWidth?: number;
  shadow?: ShadowToken;
  /** The focus treatment, derived from the theme's accent. */
  ring?: RingToken;
  opacity?: number;
  overflow?: NonNullable<ViewStyle['overflow']>;
}

type Rule =
  | string
  | readonly string[]
  | Readonly<Record<string, unknown>>
  | ((value: unknown) => Readonly<Record<string, unknown>>);

/**
 * `satisfies Record<keyof BoxStyleProps, Rule>` is what makes the interface and
 * the table one source of truth: a prop added to `BoxStyleProps` and forgotten
 * here is a compile error. Without that link the two drift silently and in two
 * different ways - <Box> forwards the unknown name to the host view as a DOM
 * attribute, and a recipe emits it verbatim as a bogus style key.
 */
const RULES = {
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
  gap: 'gap',

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
  radius: (v) => ({
    borderRadius: typeof v === 'number' ? v : activeTheme().radius[v as RadiusToken],
  }),
  // Before `borderWidth`, so an explicit width always beats the hairline.
  border: (v) => ({ borderColor: color(v as string), borderWidth: 1 }),
  borderWidth: 'borderWidth',
  shadow: (v) => ({ boxShadow: activeTheme().shadow[v as ShadowToken] }),
  // Guarded: <Focusable> has its own boolean `ring` prop, and a spread bag must
  // not smuggle it in as a paint.
  ring: (v) => (typeof v === 'string' ? { boxShadow: activeTheme().ring[v as RingToken] } : {}),
  opacity: 'opacity',
  overflow: 'overflow',
} as const satisfies Record<keyof BoxStyleProps, Rule>;

const RULE_KEYS = Object.keys(RULES) as (keyof typeof RULES)[];

/** The shorthand names as a lookup, shared by <Box>'s prop split and the
 *  resolver below. */
export const BOX_STYLE_PROPS: ReadonlySet<string> = new Set(RULE_KEYS);

/**
 * Split a prop bag into the shorthands and everything else.
 *
 * Both consumers need exactly this partition - <Box> to tell a style prop from a
 * real View prop, a recipe to tell what needs resolving from what passes through
 * - so the rule for recognising a shorthand lives in one place.
 */
export function splitShorthand(props: Readonly<Record<string, unknown>>): {
  shorthand: Record<string, unknown>;
  rest: Record<string, unknown>;
  /** Whether any shorthand was found, so a caller can skip the resolver. */
  any: boolean;
} {
  const shorthand: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  let any = false;
  for (const key of Object.keys(props)) {
    if (BOX_STYLE_PROPS.has(key)) {
      shorthand[key] = props[key];
      any = true;
    } else rest[key] = props[key];
  }
  return { shorthand, rest, any };
}

export function boxStyle(p: Readonly<BoxStyleProps>): ViewStyle {
  const out: Record<string, unknown> = {};
  for (const key of RULE_KEYS) {
    const value = (p as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const rule: Rule = RULES[key];
    if (typeof rule === 'string') {
      out[rule] = value;
    } else if (typeof rule === 'function') {
      Object.assign(out, rule(value));
    } else if (Array.isArray(rule)) {
      for (const longhand of rule) out[longhand] = value;
    } else if (value) {
      Object.assign(out, rule);
    }
  }
  return out as ViewStyle;
}

/**
 * The text half of the vocabulary. Only a style DECLARATION speaks it (a recipe
 * layer, a `styles()` value); it is deliberately not part of `BoxStyleProps`,
 * because a <Box> is a View and a View cannot paint type.
 */
export interface TextStyleProps {
  /** A whole type role, spread under the rest of the layer, so
   *  `{ text: 'label', fontSize: 13 }` is the label role at 13px. */
  text?: TypeRole;
  /** Font family by token name; wins over the family `text` brought in. */
  font?: FontToken;
}

/**
 * Resolves the text shorthands of one layer, consuming their keys, or nothing
 * if it has none. Membership-checked against the theme, not just typeof: a slot
 * that feeds a component's PROPS may carry a `text` of its own, and that one
 * must pass through untouched.
 */
export function textStyle(decl: Record<string, unknown>): Record<string, unknown> | undefined {
  const theme = activeTheme();
  const role = decl.text;
  const family = decl.font;
  const hasRole = typeof role === 'string' && role in theme.type;
  const hasFamily = typeof family === 'string' && family in theme.fonts;
  if (!hasRole && !hasFamily) return undefined;
  const out: Record<string, unknown> = {};
  if (hasRole) {
    Object.assign(out, theme.type[role as TypeRole]);
    delete decl.text;
  }
  if (hasFamily) {
    out.fontFamily = theme.fonts[family as FontToken];
    delete decl.font;
  }
  return out;
}
