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

/**
 * A `style` that resizes the text carries two absolutes with it that were sized
 * for the ROLE's font size, not for the new one.
 *
 * `lineHeight` is the one that breaks visibly: web only spills the glyph out of
 * the line box, but native React Native CLIPS it (the PIN keypad's 28px digits
 * lost their tops to `body`'s 25px line). `letterSpacing` breaks quietly, which
 * is worse - an overline resized from 11px to 13px kept 11px's tracking and read
 * as a tighter eyebrow, so every 10-foot screen wrote the whole style by hand
 * instead. Both are re-derived from what the role AUTHORS (a ratio and an em),
 * and only when the caller has not stated them.
 */
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
