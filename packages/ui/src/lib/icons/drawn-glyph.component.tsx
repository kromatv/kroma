import { StyleSheet, View, type ViewStyle } from 'react-native';
import type { DrawnGlyphProps } from './drawn-glyph-types';
import { STROKE_PROP } from './stroke-prop';

const MIRROR = { style: StyleSheet.create({ mirror: { transform: [{ scaleX: -1 }] } }).mirror };

const FADES = new Map<number | string, ViewStyle>();
function fade(opacity: number | string): ViewStyle {
  const hit = FADES.get(opacity);
  if (hit) {
    return hit;
  }
  const style = StyleSheet.create({
    fade: { opacity, alignItems: 'flex-start' } as ViewStyle,
  }).fade;
  FADES.set(opacity, style);
  return style;
}

/** Draws a glyph; a translucent one fades through a wrapper, since Tabler's native build spreads extra props onto every path. */
function DrawnGlyph({ Glyph, size, color, opacity, thickness, mirror }: Readonly<DrawnGlyphProps>) {
  const drawn = { [STROKE_PROP]: thickness, ...(mirror ? MIRROR : null) };
  if (opacity === 1) {
    return <Glyph size={size} color={color} {...drawn} />;
  }
  return (
    <View style={fade(opacity)}>
      <Glyph size={size} color={color} {...drawn} />
    </View>
  );
}

export { DrawnGlyph };
