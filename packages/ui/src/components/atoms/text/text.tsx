// Typed text. In CSS, `body { color; font-family }` cascades into every
// descendant; in React Native it does NOT, so a bare <Text> would render as
// black 14px system font. Every string in the app goes through this component,
// which resolves a design type role and a palette colour, both off the active
// theme, so a swap repaints every string.

import {
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
} from 'react-native';
import {
  activeTheme,
  type ColorToken,
  type FontToken,
  type StyleDecl,
  sharedStyle,
  splitShorthand,
  TEXT_STYLE_PROPS,
  type TextLayoutProps,
  type TypeRole,
  themed,
  useBreakpointStep,
} from '#ui/core';

// Registered, not spread: a role read straight off the theme is a plain object,
// which react-native-web re-serialises onto every string it paints.
const typeStyles = themed((theme) => StyleSheet.create({ ...theme.type }));

const familyStyles = themed((theme) =>
  StyleSheet.create(
    Object.fromEntries(Object.entries(theme.fonts).map(([k, v]) => [k, { fontFamily: v }])),
  ),
);

interface TextProps extends Omit<RNTextProps, 'style' | 'role'>, TextLayoutProps {
  /** Design type role. Defaults to `body`. (Named `variant`, not `role`, which
   *  React Native already uses for the ARIA role.) */
  variant?: TypeRole;
  /** Palette token, or any raw colour string for a one-off (the design uses a
   *  few literal rgba washes that are not tokens). Defaults to `text`. */
  color?: ColorToken | (string & {});
  /** Overrides the family the role names, keeping its size, weight and rhythm.
   *  This is how a version string or a URL is set in `mono`. */
  font?: FontToken;
  /** Escape hatch for what the vocabulary does not name, merged last. Type is
   *  not one of those things: a size or a weight here is a missing role. */
  style?: StyleProp<TextStyle>;
  /** Clamp to N lines with an ellipsis (the RN spelling of line-clamp). */
  lines?: number;
}

// A style that resizes the text carries two absolutes sized for the role's
// original font size. `lineHeight` breaks visibly (React Native clips text
// that overflows it, unlike the web) and `letterSpacing` breaks quietly,
// drifting from the role's authored tracking. Both are re-derived from what
// the role authors (a ratio and an em), only when the caller hasn't stated them.
function sizeFix(variant: TypeRole, style: StyleProp<TextStyle>): TextStyle | null {
  if (!style) return null;
  const flat = StyleSheet.flatten(style);
  const size = flat?.fontSize;
  const spec = activeTheme().typeSpec[variant];
  if (typeof size !== 'number' || size === spec.size) return null;
  const em = 'em' in spec ? spec.em : undefined;
  return {
    ...(flat.lineHeight === undefined ? { lineHeight: Math.round(size * spec.ratio) } : null),
    ...(flat.letterSpacing === undefined && em !== undefined
      ? { letterSpacing: Math.round(size * em * 100) / 100 }
      : null),
  };
}

function Text({
  variant = 'body',
  color = 'text',
  font,
  style,
  lines,
  ...props
}: Readonly<TextProps>) {
  const paint = {
    variant,
    color,
    font,
    style,
    lines,
    split: splitShorthand(props, TEXT_STYLE_PROPS),
  };
  // Only a string stating a value per breakpoint follows the design width, and
  // only it pays for a subscription; see <Box>.
  return paint.split.breakpoints === 0 ? painted(paint, 0) : <FluidText {...paint} />;
}

function FluidText(paint: Readonly<FluidTextProps>) {
  return painted(paint, useBreakpointStep(paint.split.breakpoints));
}

interface FluidTextProps {
  variant: TypeRole;
  color: ColorToken | (string & {});
  font?: FontToken;
  style?: StyleProp<TextStyle>;
  lines?: number;
  split: ReturnType<typeof splitShorthand>;
}

// Shared by identity per (colour, theme): a fresh `{ color }` per render would
// be a styleq miss for every string on the screen. The layout half is shared
// the same way, keyed on the split's canonical key, which the step joins only
// when the string actually states one.
function painted(
  { variant, color, font, style, lines, split }: Readonly<FluidTextProps>,
  step: number,
) {
  const ink = sharedStyle(`txt:${color}`, { color });
  const key = split.breakpoints === 0 ? split.key : `${step}|${split.key}`;
  const layout = split.key ? sharedStyle(`txt:layout:${key}`, split.shorthand as StyleDecl) : null;
  return (
    <RNText
      {...split.rest}
      numberOfLines={lines}
      style={[
        typeStyles()[variant],
        font ? familyStyles()[font] : null,
        ink,
        layout,
        style,
        sizeFix(variant, style),
      ]}
    />
  );
}

export type { TextProps };
export { Text };
