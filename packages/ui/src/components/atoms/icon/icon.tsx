// <Icon>: one glyph component for every target.
//
// Each name maps to a Tabler component (see icons/glyphs.ts). Nothing here is
// platform-specific: the web bundlers alias @tabler/icons-react-native to the
// DOM package, so this single file draws through react-native-svg on a
// television and through a real <svg> element in a browser. The one thing the
// two packages do not agree on is the name of the outline-weight prop, which
// arrives as `STROKE_PROP`.

import { View, type ViewStyle } from 'react-native';
import { type IconProps, resolveIcon } from '#ui/lib/glyph';
import { STROKE_PROP } from '#ui/lib/icons/stroke-prop';

export type { IconName, IconProps } from '#ui/lib/glyph';

// The palette holds a handful of alphas, and icons re-render on every focus
// move in a 10-foot grid, so the fade styles are worth remembering.
const FADES = new Map<number | string, ViewStyle>();
function fade(opacity: number | string): ViewStyle {
  const hit = FADES.get(opacity);
  if (hit) return hit;
  const style = { opacity, alignItems: 'flex-start' } as unknown as ViewStyle;
  FADES.set(opacity, style);
  return style;
}

function Icon(props: Readonly<IconProps>) {
  const { Glyph, size, color, opacity, thickness } = resolveIcon(props);
  // Spread rather than a literal prop: the key is decided per platform, and a
  // computed key cannot be written inline without losing the type of the rest.
  const weight = { [STROKE_PROP]: thickness };
  const glyph = <Glyph size={size} color={color} {...weight} />;
  // A translucent colour (`textDim`, `textMuted`) fades the FINISHED glyph, in
  // one composite, rather than each of its strokes - see `splitAlpha`. The
  // wrapper only appears when there is alpha to apply, so the opaque case, which
  // is nearly all of them, still renders the glyph and nothing else.
  return opacity === 1 ? glyph : <View style={fade(opacity)}>{glyph}</View>;
}

export { Icon };
