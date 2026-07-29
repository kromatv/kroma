// <Button>: the action primitive.
//
// It is a <Focusable>, so the same component is a mouse button in the browser
// and a D-pad target on a TV, with the amber ring and the design's 1.04 press
// scale already wired. The whole design — fills, paddings, label metrics — is
// declared once with `sv` slots rather than assembled from conditionals and
// parallel lookup maps at the call site.

import type { ReactNode } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { Txt } from '#ui/components/atoms/text';
import { sv } from '#ui/lib/sv';
import { colors, radius, type as typeRoles } from '#ui/lib/tokens';

const buttonVariants = sv({
  slots: {
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      borderRadius: radius.md,
    },
    label: typeRoles.label,
  },
  variants: {
    variant: {
      primary: { root: { backgroundColor: colors.accent } },
      glass: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          borderColor: colors.borderStrong,
        },
      },
      ghost: { root: { backgroundColor: 'transparent' } },
      danger: { root: { backgroundColor: colors.danger } },
      /** A dark wash for a control floating OVER artwork it must not brighten
       *  (a skip-intro pill, an overlay's quiet action). */
      scrim: {
        root: {
          backgroundColor: 'rgba(10, 10, 12, 0.7)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.15)',
        },
      },
      /** A bordered toggle: the detail screen's "Ma liste" / "Vu" pills, which
       *  read as pressed rather than as a primary action. */
      outline: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.12)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        },
      },
    },
    active: {
      true: {},
      false: {},
    },
    size: {
      sm: {
        root: { paddingVertical: 9, paddingHorizontal: 16 },
        label: { fontSize: 13, fontWeight: '600' },
      },
      md: {
        root: { paddingVertical: 14, paddingHorizontal: 28 },
        label: { fontSize: 16, fontWeight: '700' },
      },
      lg: {
        root: { paddingVertical: 17, paddingHorizontal: 38 },
        label: { fontSize: 19, fontWeight: '700' },
      },
      /** The 10-foot primary action (the home hero, a detail screen's Lecture). */
      tv: {
        root: { paddingVertical: 18, paddingHorizontal: 40 },
        label: { fontSize: 20, fontWeight: '700' },
      },
    },
    block: {
      true: { root: { alignSelf: 'stretch' } },
      false: {},
    },
  },
  compound: [
    {
      when: { variant: 'outline', active: 'true' },
      style: {
        root: { backgroundColor: colors.accentSoft, borderColor: 'rgba(242, 180, 66, 0.45)' },
      },
    },
  ],
  defaults: { variant: 'primary', size: 'md', block: 'false', active: 'false' },
});

type ButtonVariant = 'primary' | 'glass' | 'ghost' | 'danger' | 'outline' | 'scrim';
type ButtonSize = 'sm' | 'md' | 'lg' | 'tv';

const ICON_SIZE = { sm: 16, md: 20, lg: 22, tv: 22 } satisfies Record<ButtonSize, number>;

/** Ink colour per variant: amber fills carry the dark ink, everything else the
 * body text colour. */
/** The token a button's glyph and label are drawn in. */
type ButtonInk = (typeof INK)[ButtonVariant] | 'accent';

const INK = {
  primary: 'accentInk',
  glass: 'text',
  ghost: 'text',
  danger: 'text',
  outline: 'text',
  scrim: 'text',
} as const;

/** The brightened fill while a finger is down: touch's answer to the focus
 * ring. Amber goes to its hover step; the translucent fills step up. */
const PRESSED = {
  primary: { backgroundColor: colors.accentHover },
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
  ghost: { backgroundColor: 'rgba(255, 255, 255, 0.08)' },
  danger: { opacity: 0.85 },
  outline: { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
  scrim: { backgroundColor: 'rgba(40, 40, 48, 0.75)' },
} as const;

/**
 * The fill while a POINTER rests on the control: the MOUSE's answer to the focus
 * ring, and the only one the browser gets on a page with no navigator - the web
 * client mounts no <FocusScope>, so a cursor crossing a button there produced
 * exactly nothing before this map existed. See <Focusable>'s `hoveredStyle`.
 *
 * One step SHORT of `PRESSED` throughout, so hover → press reads as a single
 * escalation rather than as two unrelated states. It lands on the frame the
 * pointer arrives, deliberately: the kit does not transition background colour
 * (see focus-transition.web.ts - it cost a third of the frame rate on a TV
 * panel), and an instant answer is the right one for a cursor anyway.
 */
const HOVERED = {
  primary: { backgroundColor: colors.accentHover },
  glass: { backgroundColor: 'rgba(255, 255, 255, 0.16)' },
  ghost: { backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  danger: { backgroundColor: colors.dangerHover },
  outline: { backgroundColor: 'rgba(255, 255, 255, 0.17)' },
  scrim: { backgroundColor: 'rgba(28, 28, 34, 0.72)' },
} as const;

/** An `outline` toggle that is already ON hovers AMBER, one step up from its
 * `accentSoft` fill - see the token for why it cannot be the white wash. */
const HOVERED_ACTIVE = { backgroundColor: colors.accentSoftHover } as const;

interface ButtonProps
  extends Omit<FocusableProps, 'children' | 'style' | 'focusScale' | 'label' | 'ring'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the width of the parent. */
  block?: boolean;
  /** Pressed state of a toggle. Only the `outline` variant paints it. */
  active?: boolean;
  /** Leading glyph. */
  icon?: IconName;
  /** Trailing glyph (a chevron on a settings row, for instance). */
  iconRight?: IconName;
  /** Text label. It is also the accessibility name. Pass `children` instead for
   *  anything richer than a string. */
  label?: string;
  /** Busy: a spinner takes the leading glyph's place and presses are ignored.
   *  The control stays focusable - a submit that dropped out of the navigator
   *  mid-spin would strand the remote on nothing. */
  loading?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Focus scale. Defaults to the design's 1.04 for the primary action. */
  focusScale?: number;
}

function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  active = false,
  icon,
  iconRight,
  label,
  loading = false,
  children,
  style,
  disabled = false,
  focusScale = 1.04,
  onPress,
  ...focusProps
}: Readonly<ButtonProps>) {
  // An active toggle tints its glyph and label amber along with its fill - and
  // hovers amber too, for the same reason.
  const on = variant === 'outline' && active;
  const ink = on ? 'accent' : INK[variant];
  const hover = on ? HOVERED_ACTIVE : HOVERED[variant];
  const glyph = ICON_SIZE[size];
  const s = buttonVariants({
    variant,
    size,
    block: block ? 'true' : 'false',
    active: active ? 'true' : 'false',
  });
  // The translucent coats frost what sits behind them (see <Frost>); the
  // radius follows any caller override so the blur clips with the corner.
  const frostRadius = StyleSheet.flatten([s.root, style])?.borderRadius;
  return (
    <Focusable
      {...focusProps}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      focusScale={focusScale}
      label={label}
      pressedStyle={PRESSED[variant]}
      // A busy button takes no press, so it lights for no pointer either: the
      // spinner says what is happening and a highlight would promise a click
      // that `onPress={undefined}` above has already dropped. (Disabled needs no
      // such guard - <Focusable> paints none of the three states there.)
      hoveredStyle={loading ? undefined : hover}
      style={[s.root, disabled && DISABLED, style]}
    >
      {FROSTED.has(variant) ? (
        <Frost radius={typeof frostRadius === 'number' ? frostRadius : radius.md} />
      ) : null}
      <ButtonContent
        ink={ink}
        glyph={glyph}
        icon={icon}
        iconRight={iconRight}
        label={label}
        labelStyle={s.label}
        loading={loading}
      >
        {children}
      </ButtonContent>
    </Focusable>
  );
}

/** What sits inside the button: the leading glyph (or the spinner that replaces
 * it), the label, whatever the caller nested, and the trailing glyph.
 *
 * Its own component because every part of it is optional, and four independent
 * "draw this if you were given one" decisions belong somewhere that is only
 * about them - `<Button>` above is already deciding variant, ink, hover, frost
 * and press state. */
function ButtonContent({
  ink,
  glyph,
  icon,
  iconRight,
  label,
  labelStyle,
  loading,
  children,
}: Readonly<{
  ink: ButtonInk;
  glyph: number;
  icon?: IconName;
  iconRight?: IconName;
  label?: string;
  labelStyle: StyleProp<TextStyle>;
  loading: boolean;
  children?: ReactNode;
}>) {
  // A busy button shows the spinner INSTEAD of its leading glyph, so the row
  // keeps its width and nothing shifts when the press resolves.
  const leading = loading ? (
    <Spinner size={glyph} color={colors[ink]} />
  ) : (
    icon && <Icon name={icon} size={glyph} color={ink} />
  );
  return (
    <>
      {leading}
      {label === undefined ? null : (
        <Txt color={ink} style={labelStyle}>
          {label}
        </Txt>
      )}
      {children}
      {iconRight ? <Icon name={iconRight} size={glyph} color={ink} /> : null}
    </>
  );
}

const DISABLED = { opacity: 0.5 } as const;

/** The variants whose fill is a translucency over whatever sits behind - the
 * ones a backdrop blur has anything to do for. Solid fills stay solid. */
const FROSTED = new Set<ButtonVariant>(['glass', 'outline', 'scrim']);

export type { ButtonProps, ButtonSize, ButtonVariant };
export { Button, buttonVariants };
