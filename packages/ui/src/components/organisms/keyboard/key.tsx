// One key of an <OnScreenKeyboard>. A <Focusable>, so the spatial focus nav
// reaches it and OK activates it.

import type { TextStyle, ViewStyle } from 'react-native';
import { Focusable } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Text } from '#ui/components/atoms/text';
import { type RadiusToken, type StyleDecl, svFor } from '#ui/core';
import { keyFace } from '#ui/lib/field-shell';

/** A keyboard's scale: `sm` is arm's length, `tv` is across a room. */
type KeyboardSize = 'sm' | 'tv';

/**
 * One key box and one gap per size, for BOTH grids, so a keyboard is the same
 * object whichever layout it is showing. Fixed rather than flex: every grid
 * has a ten-key digits row, so a flex-sized key made the letters of a shorter
 * row wider than the digits above them, and a grid with no parent width to
 * divide collapsed to its glyphs.
 */
const KEY_SIZES = {
  sm: { width: 44, height: 48, gap: 8, fontSize: 19, glyph: 22 },
  tv: { width: 78, height: 74, gap: 12, fontSize: 30, glyph: 34 },
} as const satisfies Record<KeyboardSize, Readonly<Record<string, number>>>;

function keyMetrics(size: KeyboardSize) {
  return KEY_SIZES[size];
}

// The corner PER SIZE, not one number for both: the keypad's 22 reads as a
// rounded square on a 78x74 television key and as half the width of a 44x48
// one, so the whole small grid arrives as circles. Both are radius tokens, and
// `tv` is deliberately the keypad's own - that is what makes a keyboard key and
// a keypad key the same object at two scales.
const keyRadius = { sm: 'lg', tv: '2xl' } as const satisfies Record<KeyboardSize, RadiusToken>;

/** The width of a ten-key row: what a grid measures itself against. */
function keyRowWidth(size: KeyboardSize): number {
  const { width, gap } = KEY_SIZES[size];
  return width * 10 + gap * 9;
}

// The shared key face (lib/field-shell), plus the one thing that is this
// grid's own: the corner its size carries.
const face = svFor<{
  root: StyleDecl;
  glyph: Pick<IconProps, 'color' | 'stroke'>;
  label: StyleDecl;
}>()({
  slots: keyFace,
  variants: {
    size: {
      sm: { root: { radius: keyRadius.sm } },
      tv: { root: { radius: keyRadius.tv } },
    },
  },
});

interface KeyProps {
  label?: string;
  icon?: IconName;
  iconSize?: number;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
  /** The grid's scale, which is what the corner is taken from. */
  size: KeyboardSize;
  autoFocus?: boolean;
}

function Key({
  label,
  icon,
  iconSize,
  onPress,
  style,
  textStyle,
  size,
  autoFocus,
}: Readonly<KeyProps>) {
  return (
    <Focusable
      onPress={onPress}
      label={label}
      autoFocus={autoFocus}
      focusScale={1.08}
      sv={face}
      vars={{ size }}
      style={style}
    >
      {({ slots }) => (
        <>
          {/* The fill is translucent (lib/field-shell), so blur what shows
              through: a key reads as glass, not as a window on the artwork. */}
          <Frost radius={keyRadius[size]} />
          {icon ? (
            <Icon name={icon} size={iconSize ?? 24} {...slots.glyph} />
          ) : (
            <Text style={[slots.label, textStyle]}>{label}</Text>
          )}
        </>
      )}
    </Focusable>
  );
}

export type { KeyboardSize, KeyProps };
export { face as keyVariants, Key, keyMetrics, keyRowWidth };
