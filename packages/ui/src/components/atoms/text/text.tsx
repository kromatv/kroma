// Typed text. In CSS, `body { color; font-family }` cascades into every
// descendant; in React Native it does NOT, so a bare <Text> would render as
// black 14px system font. Every string in the app goes through this component,
// which resolves a design type role and a palette colour.

import {
  Text as RNText,
  type StyleProp,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { color as resolveColor } from '#ui/lib/box-style';
import { type ColorToken, type TypeRole, type as typeRoles, typeSpec } from '#ui/lib/tokens';

interface TxtProps extends Omit<TextProps, 'style' | 'role'> {
  /** Design type role. Defaults to `body`. (Named `variant`, not `role`, which
   *  React Native already uses for the ARIA role.) */
  variant?: TypeRole;
  /** Palette token, or any raw colour string for a one-off (the design uses a
   *  few literal rgba washes that are not tokens). Defaults to `text`. */
  color?: ColorToken | (string & {});
  /** Escape hatch for one-off sizing/weight, merged last. */
  style?: StyleProp<TextStyle>;
  /** Clamp to N lines with an ellipsis (the RN spelling of line-clamp). */
  lines?: number;
}

// A style that resizes the text carries two absolutes sized for the role's
// original font size. `lineHeight` breaks visibly — React Native clips text
// that overflows it, unlike the web — and `letterSpacing` breaks quietly,
// drifting from the role's authored tracking. Both are re-derived from what
// the role authors (a ratio and an em), only when the caller hasn't stated them.
function sizeFix(variant: TypeRole, style: StyleProp<TextStyle>): TextStyle | null {
  if (!style) return null;
  const flat = StyleSheet.flatten(style);
  const size = flat?.fontSize;
  const spec = typeSpec[variant];
  if (typeof size !== 'number' || size === spec.size) return null;
  const em = 'em' in spec ? spec.em : undefined;
  return {
    ...(flat.lineHeight === undefined ? { lineHeight: Math.round(size * spec.ratio) } : null),
    ...(flat.letterSpacing === undefined && em !== undefined
      ? { letterSpacing: Math.round(size * em * 100) / 100 }
      : null),
  };
}

function Txt({ variant = 'body', color = 'text', style, lines, ...rest }: Readonly<TxtProps>) {
  return (
    <RNText
      {...rest}
      numberOfLines={lines}
      style={[typeRoles[variant], { color: resolveColor(color) }, style, sizeFix(variant, style)]}
    />
  );
}

export type { TxtProps };
export { Txt };
