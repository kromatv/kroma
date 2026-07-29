// <IconButton>: a round, icon-only control (the theme-song mute, a close button,
// a player transport key). Same focus behaviour as <Button>, no label.

import type { ReactNode } from 'react';
import type { ViewStyle } from 'react-native';
import { Focusable, type FocusableProps, type FocusState } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { sv } from '#ui/lib/sv';
import { colors, radius } from '#ui/lib/tokens';

const iconButtonVariants = sv({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  variants: {
    variant: {
      /** Translucent fill with a hairline border: the default over artwork. */
      glass: {
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
      },
      ghost: { backgroundColor: 'transparent' },
      primary: { backgroundColor: colors.accent },
      /** A dark wash instead of a light one: the control that floats OVER
       *  artwork it must not brighten (a back button on a detail hero, the
       *  skip-intro corner of the player). */
      scrim: {
        backgroundColor: 'rgba(10, 10, 12, 0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
      },
    },
  },
  defaults: { variant: 'glass' },
});

/** How the button is filled. Named once, because the pressed-state table below
 * has to cover exactly these and a second spelling could drift from it. */
export type IconButtonVariant = 'glass' | 'ghost' | 'primary' | 'scrim';

/** The brightened fill a finger gets: the touch reading of the focus state
 * (the player cluster's CTRL_ON for glass, the hover amber for primary). */
const PRESSED: Record<IconButtonVariant, ViewStyle> = {
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.22)' },
  ghost: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  primary: { backgroundColor: colors.accentHover },
  scrim: { backgroundColor: 'rgba(40, 40, 48, 0.65)' },
};

/** The fill under a POINTER, one step short of `PRESSED` so hover → press reads
 * as a single escalation. The web's own answer, and on a page that mounts no
 * focus scope the only one a cursor gets - see <Focusable>'s `hoveredStyle`. */
const HOVERED: Record<'glass' | 'ghost' | 'primary' | 'scrim', ViewStyle> = {
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  ghost: { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  primary: { backgroundColor: colors.accentHover },
  scrim: { backgroundColor: 'rgba(28, 28, 34, 0.6)' },
};

/** The pressed state of a toggle (a watched check, a workbench tool): the
 * accent's soft wash, same recipe as <Button variant="outline" active>. */
const ACTIVE: ViewStyle = {
  backgroundColor: colors.accentSoft,
  borderColor: 'rgba(242, 180, 66, 0.45)',
};

/** ...and that toggle under the cursor: still amber, one step up. */
const ACTIVE_HOVERED: ViewStyle = { backgroundColor: colors.accentSoftHover };

/** `focusFill`: while focused the control fills solid accent and the glyph
 * flips to ink - the 10-foot treatment for a bare corner control (a back
 * button) whose focus has to read from three metres away. */
const FOCUS_FILL: ViewStyle = {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
};

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
  focusedStyle,
  focusScale = 1.04,
  children,
  ...focusProps
}: Readonly<IconButtonProps>) {
  const glyphSize = glyph ?? Math.round(size * 0.4);
  /** Glyph colour by state, most specific first: a focus fill flips to ink, an
   * active toggle tints accent, a primary fill is always ink. */
  const ink = (focused: boolean) => {
    if (focusFill && focused) return 'accentInk';
    if (active) return 'accent';
    return variant === 'primary' ? 'accentInk' : 'text';
  };
  // The translucent coats frost what sits behind them (see <Frost>). The
  // content may be a render function, so the layer rides along either way.
  const frost =
    variant === 'glass' || variant === 'scrim' ? (
      <Frost radius={cornerRadius ?? radius.pill} />
    ) : null;
  const content =
    children ??
    (icon
      ? ({ focused }: FocusState) => <Icon name={icon} size={glyphSize} color={ink(focused)} />
      : null);
  return (
    <Focusable
      {...focusProps}
      focusScale={focusScale}
      pressedStyle={PRESSED[variant]}
      hoveredStyle={active ? ACTIVE_HOVERED : HOVERED[variant]}
      focusedStyle={[focusedStyle, focusFill ? FOCUS_FILL : null]}
      style={iconButtonVariants(
        { variant },
        { width: size, height: size },
        active ? ACTIVE : null,
        cornerRadius === undefined ? null : { borderRadius: cornerRadius },
        style,
      )}
    >
      {typeof content === 'function' ? (
        (state: FocusState) => (
          <>
            {frost}
            {content(state)}
          </>
        )
      ) : (
        <>
          {frost}
          {content}
        </>
      )}
    </Focusable>
  );
}

export type { IconButtonProps };
export { IconButton, iconButtonVariants };
