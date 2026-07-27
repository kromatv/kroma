// The <Box> shorthand resolver: prop bag in, one ViewStyle out.
//
// Pure and separate from the component so the mapping is unit-tested rather than
// eyeballed, and so <Box> itself stays a five-line render.
//
// Sizes are plain numbers, deliberately. Every TV screen is authored on the
// fixed 1920x1080 canvas (see <TvStage>), so a number IS the design's px value:
// no scale to memorise, and it matches how the design specifies arbitrary values
// (px-9, gap-2.75, text-[19px]) rather than pretending they sit on a 4pt grid.
// Only the values that ARE tokens (colour, radius, elevation) take token names.

import { type DimensionValue, StyleSheet, type ViewStyle } from 'react-native';
import { absoluteFill, type ColorToken, colors, radius, shadow } from './tokens';

/** A length. Numbers are px on the 1920x1080 design canvas; percentage strings
 * are allowed because a few places in the design genuinely are relative (the
 * subtitle line sits at 17% of the frame, not at a fixed offset). */
export type Spacing = DimensionValue;
export type Align = ViewStyle['alignItems'];
export type Justify = ViewStyle['justifyContent'];

export interface BoxStyleProps {
  // ---- flex ----
  /** `flex: 1` when true, or the explicit flex factor. */
  flex?: boolean | number;
  /** Lay children out horizontally (default is React Native's column). */
  row?: boolean;
  wrap?: boolean;
  /** Centre on BOTH axes: the single most common layout in a 10-foot UI. */
  center?: boolean;
  align?: Align;
  justify?: Justify;
  /** Override the parent's alignment for this child alone. */
  self?: NonNullable<ViewStyle['alignSelf']>;
  /** `flexShrink`. Rail tiles set 0 so they keep their width in a row. */
  shrink?: number;
  grow?: number;
  gap?: Spacing;
  /** Space children evenly with the container's ends flush. */
  between?: boolean;

  // ---- box ----
  w?: DimensionValue;
  h?: DimensionValue;
  minW?: DimensionValue;
  minH?: DimensionValue;
  maxW?: DimensionValue;
  maxH?: DimensionValue;
  aspect?: number;

  // ---- position ----
  /** Stretch to the positioned parent (absolute, inset 0). */
  fill?: boolean;
  absolute?: boolean;
  top?: DimensionValue;
  right?: DimensionValue;
  bottom?: DimensionValue;
  left?: DimensionValue;
  z?: number;

  // ---- spacing ----
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

  // ---- paint ----
  /** A palette token name, or any raw colour string for one-offs. */
  bg?: ColorToken | (string & {});
  radius?: keyof typeof radius | number;
  border?: ColorToken | (string & {});
  borderWidth?: number;
  /** Elevation token. */
  shadow?: keyof typeof shadow;
  opacity?: number;
  overflow?: NonNullable<ViewStyle['overflow']>;
}

/** A token name resolves through the palette; anything else is a raw colour. */
export function color(value: string): string {
  return (colors as Record<string, string>)[value] ?? value;
}

function radiusOf(value: keyof typeof radius | number): number {
  return typeof value === 'number' ? value : radius[value];
}

/** Assign only the defined entries, so `<Box />` produces an empty style rather
 * than a bag of `undefined`s that React Native would still have to diff. */
function put(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) out[key] = value;
}

export function boxStyle(p: Readonly<BoxStyleProps>): ViewStyle {
  const out: Record<string, unknown> = p.fill ? { ...absoluteFill } : {};

  if (p.flex === true) out.flex = 1;
  else put(out, 'flex', p.flex);
  if (p.row) out.flexDirection = 'row';
  if (p.wrap) out.flexWrap = 'wrap';
  if (p.center) {
    out.alignItems = 'center';
    out.justifyContent = 'center';
  }
  if (p.between) out.justifyContent = 'space-between';
  put(out, 'alignItems', p.align);
  put(out, 'justifyContent', p.justify);
  put(out, 'alignSelf', p.self);
  put(out, 'flexShrink', p.shrink);
  put(out, 'flexGrow', p.grow);
  put(out, 'gap', p.gap);

  put(out, 'width', p.w);
  put(out, 'height', p.h);
  put(out, 'minWidth', p.minW);
  put(out, 'minHeight', p.minH);
  put(out, 'maxWidth', p.maxW);
  put(out, 'maxHeight', p.maxH);
  put(out, 'aspectRatio', p.aspect);

  if (p.absolute) out.position = 'absolute';
  put(out, 'top', p.top);
  put(out, 'right', p.right);
  put(out, 'bottom', p.bottom);
  put(out, 'left', p.left);
  put(out, 'zIndex', p.z);

  // Longhands only, never the `padding`/`margin` shorthand: React Native
  // resolves shorthand vs longhand by declaration order inside one object, so a
  // `{ padding, paddingTop }` pair is order-dependent and surprising.
  putEdges(out, 'padding', {
    all: p.p,
    x: p.px,
    y: p.py,
    top: p.pt,
    right: p.pr,
    bottom: p.pb,
    left: p.pl,
  });
  putEdges(out, 'margin', {
    all: p.m,
    x: p.mx,
    y: p.my,
    top: p.mt,
    right: p.mr,
    bottom: p.mb,
    left: p.ml,
  });

  if (p.bg !== undefined) out.backgroundColor = color(p.bg);
  if (p.radius !== undefined) out.borderRadius = radiusOf(p.radius);
  if (p.border !== undefined) {
    out.borderColor = color(p.border);
    out.borderWidth = p.borderWidth ?? 1;
  } else {
    put(out, 'borderWidth', p.borderWidth);
  }
  if (p.shadow !== undefined) out.boxShadow = shadow[p.shadow];
  put(out, 'opacity', p.opacity);
  put(out, 'overflow', p.overflow);

  return out as ViewStyle;
}

/**
 * The same style, by IDENTITY, for the same shorthand props.
 *
 * `boxStyle` is pure but it returns a fresh object every call, and on the
 * browser targets that is the single most expensive habit in the kit. Measured
 * with the V8 profiler on the browse grid (clients/tv-build/perf-profile.ts),
 * react-native-web's style pipeline - `styleq`, `preprocess`, `inline`,
 * `createDOMProps`, `setValueForStyles` - was the largest attributable cost on
 * the main thread, and all of it is work it only does because it cannot
 * recognise the object it is being handed. styleq caches compiled styles in a
 * WeakMap keyed on the style OBJECT, so a new object per render per <Box> is a
 * guaranteed miss, every render, for every box on the screen.
 *
 * Given the same props this returns the same object, so the second render of a
 * box is a WeakMap hit. And because the object goes through `StyleSheet.create`,
 * the compiled form is a set of atomic CSS classes rather than an inline style:
 * react-native-web writes class names instead of walking the declarations again.
 *
 * The cache is keyed on the shorthand props, which are all primitives, and it is
 * capped: `w={someMeasuredNumber}` would otherwise mint a new entry forever. Past
 * the cap it simply stops caching and behaves exactly as before.
 */
const shared = new Map<string, ViewStyle>();

/** Enough for every static combination in the app several times over, small
 * enough that a pathological dynamic value cannot grow it without bound. */
const SHARED_LIMIT = 4096;

export function sharedBoxStyle(key: string, p: Readonly<BoxStyleProps>): ViewStyle {
  const hit = shared.get(key);
  if (hit) return hit;
  const made = StyleSheet.create({ box: boxStyle(p) }).box as ViewStyle;
  if (shared.size < SHARED_LIMIT) shared.set(key, made);
  return made;
}

/** Expand all / axis / side into the four longhands, most specific winning. */
/** The four sides as written, from the least specific to the most: `p`, then
 * `px`/`py`, then `pt`/`pr`/`pb`/`pl`. Named rather than positional because
 * seven optional `Spacing`s in a row are seven chances to transpose two. */
interface Edges {
  all?: Spacing;
  x?: Spacing;
  y?: Spacing;
  top?: Spacing;
  right?: Spacing;
  bottom?: Spacing;
  left?: Spacing;
}

function putEdges(out: Record<string, unknown>, prefix: 'padding' | 'margin', edges: Edges): void {
  const { all, x, y } = edges;
  const t = edges.top ?? y ?? all;
  const r = edges.right ?? x ?? all;
  const b = edges.bottom ?? y ?? all;
  const l = edges.left ?? x ?? all;
  put(out, `${prefix}Top`, t);
  put(out, `${prefix}Right`, r);
  put(out, `${prefix}Bottom`, b);
  put(out, `${prefix}Left`, l);
}
