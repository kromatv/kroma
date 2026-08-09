// <Button>: the action primitive.
//
// It is a <Focusable>, so the same component is a mouse button in the browser
// and a D-pad target on a TV, with the amber ring and the design's 1.04 press
// scale already wired. The whole design — fills, paddings, label metrics — is
// declared once with `sv` slots rather than assembled from conditionals and
// parallel lookup maps at the call site.

import { type ReactNode, useMemo } from 'react';
import { type StyleProp, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { Frost } from '#ui/components/atoms/frost';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { Txt } from '#ui/components/atoms/text';
import { type StyleDecl, svFor, useTheme, type Variant } from '#ui/core';
import { CONTROL } from '#ui/lib/field-shell';
import { useGroupMember } from '#ui/lib/group-shape';

// The row's rhythm, shared by the root and the dimmable content wrapper below.
const CONTENT_GAP = 9;

const buttonVariants = svFor<{
  root: StyleDecl;
  label: StyleDecl;
  icon: Pick<IconProps, 'color' | 'size'>;
}>()({
  slots: {
    // Disabled is NOT a root opacity: an element with opacity < 1 becomes its
    // own backdrop root, which blinds the <Frost> child's backdrop-filter.
    // Each variant fades its FILL below instead, and the content row carries
    // the ink dim (a group fade, so icon strokes never double-paint).
    root: { row: true, center: true, gap: CONTENT_GAP, radius: 'md' },
    label: { text: 'label' },
    icon: { color: 'text', size: 20 },
  },
  variants: {
    variant: {
      primary: {
        root: {
          bg: 'accent',
          _hover: { bg: 'accentHover' },
          _press: { bg: 'accentHover' },
          _disabled: { bg: 'accent/50' },
        },
        label: { color: 'accentInk' },
        icon: { color: 'accentInk' },
      },
      glass: {
        root: {
          bg: 'white/10',
          border: 'borderStrong',
          _hover: { bg: 'white/16' },
          _press: { bg: 'white/18' },
          _disabled: { bg: 'white/5', border: 'white/7' },
        },
      },
      ghost: {
        root: { bg: 'transparent', _hover: { bg: 'white/6' }, _press: { bg: 'white/8' } },
      },
      danger: {
        root: {
          bg: 'danger',
          _hover: { bg: 'dangerHover' },
          _press: { opacity: 0.85 },
          _disabled: { bg: 'danger/50' },
        },
      },
      /** Red ink, no fill: the destructive action that is an exit rather than
       *  the screen's purpose (a dialog's "Delete" beside its primary pair). */
      dangerGhost: {
        root: { bg: 'transparent', _hover: { bg: 'danger/10' }, _press: { bg: 'danger/14' } },
        label: { color: 'danger' },
        icon: { color: 'danger' },
      },
      /** A dark wash for a control floating OVER artwork it must not brighten
       *  (a skip-intro pill, an overlay's quiet action). */
      scrim: {
        root: {
          bg: 'bg/70',
          border: 'white/15',
          _hover: { bg: 'rgba(28, 28, 34, 0.72)' },
          _press: { bg: 'rgba(40, 40, 48, 0.75)' },
          _disabled: { bg: 'bg/35', border: 'white/7' },
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
          _disabled: { bg: 'white/6', border: 'white/10' },
        },
      },
    },
    active: { true: {} },
    size: {
      sm: {
        root: { py: CONTROL.sm.py, px: 16, minH: CONTROL.sm.height, radius: CONTROL.sm.radius },
        label: { fontSize: 13, fontWeight: '600', lineHeight: CONTROL.sm.line },
        icon: { size: 16 },
      },
      md: {
        root: { py: CONTROL.md.py, px: 28, minH: CONTROL.md.height, radius: CONTROL.md.radius },
        label: { fontSize: 16, fontWeight: '700', lineHeight: CONTROL.md.line },
        icon: { size: 20 },
      },
      lg: {
        root: { py: 17, px: 38 },
        label: { fontSize: 19, fontWeight: '700' },
        icon: { size: 22 },
      },
      /** The 10-foot primary action (the home hero, a detail screen's Lecture).
       *  From the table like the rest, so a tv button beside a tv field is the
       *  same height and the same corner rather than approximately both. */
      tv: {
        root: { py: CONTROL.tv.py, px: 40, minH: CONTROL.tv.height, radius: CONTROL.tv.radius },
        label: { fontSize: CONTROL.tv.fontSize, fontWeight: '700', lineHeight: CONTROL.tv.line },
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
  /** Focus scale. Defaults to the design's 1.04 for the primary action, and to
   *  1 inside a <ButtonGroup>, where a member that grows tears the line it
   *  shares with its neighbours. */
  focusScale?: number;
}

function Button({
  variant = 'primary',
  size,
  block = false,
  active = false,
  icon,
  iconRight,
  label,
  loading = false,
  children,
  style,
  disabled = false,
  focusScale,
  onPress,
  onFocus,
  onBlur,
  ...focusProps
}: Readonly<ButtonProps>) {
  const group = useGroupMember(onFocus, onBlur);
  const shell = size ?? group.size ?? 'md';
  const defaultRadius = useTheme().radius.md;
  const s = buttonVariants({ variant, size: shell, block, active }, { disabled });
  // The translucent coats frost what sits behind them (see <Frost>); the radius
  // follows any caller override so the blur clips with the corner.
  const frostRadius = StyleSheet.flatten([s.root, style])?.borderRadius;
  const box = useMemo(() => (group.style ? [group.style, style] : style), [group.style, style]);
  return (
    <Focusable
      {...focusProps}
      onPress={loading ? undefined : onPress}
      onFocus={group.onFocus}
      onBlur={group.onBlur}
      disabled={disabled}
      inert={loading}
      focusScale={focusScale ?? (group.grouped ? 1 : 1.04)}
      label={label}
      sv={buttonVariants}
      vars={{ variant, size: shell, block, active }}
      style={box}
    >
      {(state) => (
        <>
          {FROSTED.has(variant) || (disabled && !UNFILLED.has(variant)) ? (
            <Frost radius={typeof frostRadius === 'number' ? frostRadius : defaultRadius} />
          ) : null}
          {/* One group fade for the whole ink row: the fill's own alpha above
              stays outside it, so the frost keeps working. */}
          <Box row center gap={CONTENT_GAP} opacity={disabled ? 0.5 : undefined}>
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
          </Box>
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

// The variants with no fill at rest: disabling one leaves nothing to frost,
// where every other variant fades its fill translucent and frosts behind it.
const UNFILLED = new Set<ButtonVariant>(['ghost', 'dangerGhost']);

export type { ButtonProps, ButtonSize, ButtonVariant };
export { Button, buttonVariants };
