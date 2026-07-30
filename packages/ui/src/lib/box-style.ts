// The <Box> shorthand resolver: prop bag in, one ViewStyle out. Sizes are plain
// numbers, because every screen is authored on the fixed 1920x1080 canvas (see
// <TvStage>), so a number IS the design's px value. Only colour, radius and
// elevation take token names.

import { type DimensionValue, StyleSheet, type ViewStyle } from 'react-native';
import { absoluteFill, type ColorToken, colors, radius, shadow } from './tokens';

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

  bg?: ColorToken | (string & {});
  radius?: keyof typeof radius | number;
  border?: ColorToken | (string & {});
  borderWidth?: number;
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

  // Longhands only: React Native resolves shorthand vs longhand by declaration
  // order inside one object, so a `{ padding, paddingTop }` pair is surprising.
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

// styleq caches compiled styles in a WeakMap keyed on the style OBJECT, so a
// fresh object per render per <Box> is a guaranteed miss for every box on the
// screen. Returning the same object by identity makes it a hit, and going
// through `StyleSheet.create` compiles it to atomic classes rather than inline.
const shared = new Map<string, ViewStyle>();

const SHARED_LIMIT = 4096;

export function sharedBoxStyle(key: string, p: Readonly<BoxStyleProps>): ViewStyle {
  const hit = shared.get(key);
  if (hit) return hit;
  const made = StyleSheet.create({ box: boxStyle(p) }).box as ViewStyle;
  if (shared.size < SHARED_LIMIT) shared.set(key, made);
  return made;
}

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
