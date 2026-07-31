// <IconButton>: a round, icon-only control (the theme-song mute, a close button,
// a player transport key). Same focus behaviour as <Button>, no label.

import { type ReactNode, useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { type StyleDecl, svFor, useTheme, type Variant } from '#ui/core';

/** How the button is filled. */
export type IconButtonVariant = Variant<typeof iconButtonVariants, 'variant'>;

/**
 * The whole design, including every state it can be in.
 *
 * The hover fill is one step short of the press fill throughout, so hover ->
 * press reads as a single escalation; on a page with no focus scope, hover is
 * the only feedback a cursor gets. Because both live in the option they belong
 * to, a variant cannot be given a rest fill and forgotten in the state tables -
 * which is exactly what used to happen.
 */
const iconButtonVariants = svFor<{ root: StyleDecl; icon: Pick<IconProps, 'color'> }>()({
  slots: {
    root: { center: true, radius: 'pill' },
    icon: { color: 'text' },
  },
  variants: {
    variant: {
      /** Translucent fill with a hairline border: the default over artwork. */
      glass: {
        root: {
          bg: 'white/12',
          border: 'white/20',
          _hover: { bg: 'white/18' },
          _press: { bg: 'white/22' },
        },
      },
      ghost: {
        root: {
          bg: 'transparent',
          _hover: { bg: 'white/6' },
          _focus: { bg: 'white/6' },
          _press: { bg: 'white/8' },
        },
      },
      primary: {
        root: { bg: 'accent', _hover: { bg: 'accentHover' }, _press: { bg: 'accentHover' } },
        icon: { color: 'accentInk' },
      },
      /** A dark wash instead of a light one: the control that floats OVER
       *  artwork it must not brighten (a back button on a detail hero, the
       *  skip-intro corner of the player). */
      scrim: {
        root: {
          bg: 'bg/55',
          border: 'white/12',
          _hover: { bg: 'rgba(28, 28, 34, 0.6)' },
          _press: { bg: 'rgba(40, 40, 48, 0.65)' },
        },
      },
    },
    /** The pressed state of a toggle: the same recipe as
     *  <Button variant="outline" active>. */
    active: {
      true: {
        root: { bg: 'accentSoft', borderColor: 'accentWash/45', _hover: { bg: 'accentSoftHover' } },
        icon: { color: 'accent' },
      },
    },
    /** The 10-foot treatment for a bare corner control (a back button) whose
     *  focus has to read from three metres: fills solid accent and flips the
     *  glyph to ink. */
    focusFill: {
      true: {
        root: { _focus: { bg: 'accent', border: 'accent' } },
        icon: { _focus: { color: 'accentInk' } },
      },
    },
  },
  defaults: { variant: 'glass', active: false, focusFill: false },
});

interface IconButtonProps extends Omit<FocusableProps, 'children' | 'focusScale'> {
  /** The glyph. Omit it and pass `children` instead for richer content (a
   *  spinner while loading, a stateful glyph). */
  icon?: IconName;
  /** Diameter. The design uses 60 on the detail screen. */
  size?: number;
  /** Glyph size. Defaults to 40% of the diameter. */
  glyph?: number;
  variant?: IconButtonVariant;
  /** Pressed state of a toggle: the accent's soft fill, accent glyph. */
  active?: boolean;
  /** Fill solid accent while focused and flip the glyph to ink. */
  focusFill?: boolean;
  /** Corner radius override. The default is the pill; a workbench tool or a
   *  square tile passes its own. */
  radius?: number;
  focusScale?: number;
  children?: ReactNode;
}

function IconButton({
  icon,
  size = 60,
  glyph,
  variant = 'glass',
  active = false,
  focusFill = false,
  radius: cornerRadius,
  style,
  states,
  focusScale = 1.04,
  children,
  ...focusProps
}: Readonly<IconButtonProps>) {
  const glyphSize = glyph ?? Math.round(size * 0.4);
  const theme = useTheme();
  // Memoised, not inlined: <Focusable> keys its own style memo on this value,
  // and a fresh array per render re-runs the box/face split on every frame of
  // every icon button on screen.
  const box = useMemo(() => [metrics(size, cornerRadius), style], [size, cornerRadius, style]);
  // The translucent coats frost what sits behind them (see <Frost>). The
  // content may be a render function, so the layer rides along either way.
  const frost =
    variant === 'glass' || variant === 'scrim' ? (
      <Frost radius={cornerRadius ?? theme.radius.pill} />
    ) : null;
  return (
    <Focusable
      {...focusProps}
      focusScale={focusScale}
      states={states}
      sv={iconButtonVariants}
      vars={{ variant, active, focusFill }}
      style={box}
    >
      {(state) => (
        <>
          {frost}
          {children ?? (icon ? <Icon name={icon} size={glyphSize} {...state.slots.icon} /> : null)}
        </>
      )}
    </Focusable>
  );
}

/** One object per (diameter, radius) pair, shared by identity across every icon
 *  button asking for the same box. */
const boxes = new Map<string, ViewStyle>();

function metrics(size: number, radius?: number): ViewStyle {
  const key = `${size}:${radius ?? ''}`;
  const hit = boxes.get(key);
  if (hit) return hit;
  const made = StyleSheet.create({
    box:
      radius === undefined
        ? { width: size, height: size }
        : { width: size, height: size, borderRadius: radius },
  }).box as ViewStyle;
  boxes.set(key, made);
  return made;
}

export type { IconButtonProps };
export { IconButton, iconButtonVariants };
