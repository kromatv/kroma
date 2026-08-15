// <Icon>: one glyph component for every target.
//
// Each name maps to a Tabler component (see icons/glyphs.ts). The web bundlers
// alias @tabler/icons-react-native to the DOM package, so this single file draws
// through react-native-svg on a television and through a real <svg> element in a
// browser. The two builds disagree on two things, and both fit in a branch
// rather than a platform twin, because neither branch needs an import the other
// platform cannot carry: the outline-weight prop's name (`STROKE_PROP`), and
// where a translucent colour's alpha can land (below).

import { View, type ViewStyle } from 'react-native';
import { type IconProps, resolveIcon } from '#ui/lib/glyph';
import { STROKE_PROP } from '#ui/lib/icons/stroke-prop';
import { WEB } from '#ui/lib/platform';

export type { IconName, IconProps } from '#ui/lib/glyph';

// The palette holds a handful of alphas, and icons re-render on every focus
// move in a 10-foot grid, so the fade styles are worth remembering. On the web
// the fade is opacity and NOTHING else - an `alignSelf` here would overrule the
// well that centres the glyph; natively the wrapper's `alignItems` keeps the
// glyph from being stretched by a column.
const FADES = new Map<number | string, ViewStyle>();
function fade(opacity: number | string): ViewStyle {
  const hit = FADES.get(opacity);
  if (hit) return hit;
  const style = (WEB ? { opacity } : { opacity, alignItems: 'flex-start' }) as ViewStyle;
  FADES.set(opacity, style);
  return style;
}

function Icon(props: Readonly<IconProps>) {
  const { Glyph, size, color, opacity, thickness } = resolveIcon(props);
  // Spread rather than a literal prop: the key is decided per platform, and a
  // computed key cannot be written inline without losing the type of the rest.
  const weight = { [STROKE_PROP]: thickness };
  if (opacity === 1) return <Glyph size={size} color={color} {...weight} />;
  // A translucent colour (`textDim`, `textMuted`) fades the FINISHED glyph, in
  // one composite, rather than each of its strokes - see `splitAlpha`. The DOM
  // build spreads extra props onto the <svg> element alone, where CSS opacity
  // composites exactly as a parent would, so the fade rides on the glyph
  // itself. Tabler's React Native build spreads them onto every path too, which
  // would fade each stroke separately and show their overlaps - so that target
  // keeps a wrapper for the alpha to land on.
  if (WEB) return <Glyph size={size} color={color} style={fade(opacity)} {...weight} />;
  return (
    <View style={fade(opacity)}>
      <Glyph size={size} color={color} {...weight} />
    </View>
  );
}

export { Icon };
