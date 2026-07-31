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
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { Txt } from '#ui/components/atoms/text';
import { type StyleDecl, svFor, useTheme, type Variant } from '#ui/core';

const buttonVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  icon: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    root: { row: true, center: true, gap: 9, radius: 'md', _disabled: { opacity: 0.5 } },
    label: { text: 'label' },
    icon: { color: 'text', size: 20 },
  },
  variants: {
    variant: {
      primary: {
        root: { bg: 'accent', _hover: { bg: 'accentHover' }, _press: { bg: 'accentHover' } },
        label: { color: 'accentInk' },
        icon: { color: 'accentInk' },
      },
      glass: {
        root: {
          bg: 'white/10',
          border: 'borderStrong',
          _hover: { bg: 'white/16' },
          _press: { bg: 'white/18' },
        },
      },
      ghost: {
        root: { bg: 'transparent', _hover: { bg: 'white/6' }, _press: { bg: 'white/8' } },
      },
      danger: {
        root: { bg: 'danger', _hover: { bg: 'dangerHover' }, _press: { opacity: 0.85 } },
      },
      /** A dark wash for a control floating OVER artwork it must not brighten
       *  (a skip-intro pill, an overlay's quiet action). */
      scrim: {
        root: {
          bg: 'bg/70',
          border: 'white/15',
          _hover: { bg: 'rgba(28, 28, 34, 0.72)' },
          _press: { bg: 'rgba(40, 40, 48, 0.75)' },
        },
      },
      /** A bordered toggle: the detail screen's "Ma liste" / "Vu" pills, which
       *  read as pressed rather than as a primary action. */
      outline: {
        root: {
          bg: 'white/12',
          border: 'white/20',
          _hover: { bg: 'white/17' },
          _press: { bg: 'white/20' },
        },
      },
    },
    active: { true: {} },
    size: {
      sm: {
        root: { py: 9, px: 16 },
        label: { fontSize: 13, fontWeight: '600' },
        icon: { size: 16 },
      },
      md: {
        root: { py: 14, px: 28 },
        label: { fontSize: 16, fontWeight: '700' },
        icon: { size: 20 },
      },
      lg: {
        root: { py: 17, px: 38 },
        label: { fontSize: 19, fontWeight: '700' },
        icon: { size: 22 },
      },
      /** The 10-foot primary action (the home hero, a detail screen's Lecture). */
      tv: {
        root: { py: 18, px: 40 },
        label: { fontSize: 20, fontWeight: '700' },
        icon: { size: 22 },
      },
    },
    block: { true: { root: { self: 'stretch' } } },
  },
  compound: [
    {
      when: { variant: 'outline', active: true },
      style: {
        root: { bg: 'accentSoft', borderColor: 'accentWash/45', _hover: { bg: 'accentSoftHover' } },
        label: { color: 'accent' },
        icon: { color: 'accent' },
      },
    },
  ],
  defaults: { variant: 'primary', size: 'md', block: false, active: false },
});

type ButtonVariant = Variant<typeof buttonVariants, 'variant'>;
type ButtonSize = Variant<typeof buttonVariants, 'size'>;

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
  const defaultRadius = useTheme().radius.md;
  const s = buttonVariants({ variant, size, block, active }, { disabled });
  // The translucent coats frost what sits behind them (see <Frost>); the radius
  // follows any caller override so the blur clips with the corner.
  const frostRadius = StyleSheet.flatten([s.root, style])?.borderRadius;
  return (
    <Focusable
      {...focusProps}
      onPress={loading ? undefined : onPress}
      disabled={disabled}
      inert={loading}
      focusScale={focusScale}
      label={label}
      sv={buttonVariants}
      vars={{ variant, size, block, active }}
      style={style}
    >
      {(state) => (
        <>
          {FROSTED.has(variant) ? (
            <Frost radius={typeof frostRadius === 'number' ? frostRadius : defaultRadius} />
          ) : null}
          <ButtonContent
            glyph={state.slots.icon}
            icon={icon}
            iconRight={iconRight}
            label={label}
            labelStyle={state.slots.label}
            loading={loading}
          >
            {children}
          </ButtonContent>
        </>
      )}
    </Focusable>
  );
}

// Its own component because every part is optional, and `<Button>` above is
// already deciding variant, ink, hover, frost and press state.
function ButtonContent({
  glyph,
  icon,
  iconRight,
  label,
  labelStyle,
  loading,
  children,
}: Readonly<{
  glyph: Pick<IconProps, 'color' | 'size'>;
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
    <Spinner size={glyph.size} color={glyph.color} />
  ) : (
    icon && <Icon name={icon} {...glyph} />
  );
  return (
    <>
      {leading}
      {label === undefined ? null : <Txt style={labelStyle}>{label}</Txt>}
      {children}
      {iconRight ? <Icon name={iconRight} {...glyph} /> : null}
    </>
  );
}

// The variants whose fill is a translucency over whatever sits behind, the
// ones a backdrop blur has anything to do for.
const FROSTED = new Set<ButtonVariant>(['glass', 'outline', 'scrim']);

export type { ButtonProps, ButtonSize, ButtonVariant };
export { Button, buttonVariants };
