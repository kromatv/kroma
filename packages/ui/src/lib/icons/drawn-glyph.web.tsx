import { StyleSheet, type ViewStyle } from 'react-native';
import { classes } from '../classed';
import type { DrawnGlyphProps } from './drawn-glyph-types';
import { STROKE_PROP } from './stroke-prop';

const FIRM = StyleSheet.create({ firm: { flexShrink: 0 } }).firm;

const FADES = new Map<number | string, ViewStyle>();
function fade(opacity: number | string): ViewStyle {
  const hit = FADES.get(opacity);
  if (hit) return hit;
  const style = StyleSheet.create({ fade: { opacity, ...FIRM } as ViewStyle }).fade;
  FADES.set(opacity, style);
  return style;
}

/** Draws a glyph as a flex item that never shrinks; a translucent one fades on the <svg> itself. */
function DrawnGlyph({ Glyph, size, color, opacity, thickness }: Readonly<DrawnGlyphProps>) {
  const weight = { [STROKE_PROP]: thickness };
  const style = opacity === 1 ? FIRM : fade(opacity);
  return <Glyph size={size} color={color} className={classes(style)} {...weight} />;
}

export { DrawnGlyph };
