// <Button>: the action primitive.
//
// It is a <Focusable>, so the same component is a mouse button in the browser
// and a D-pad target on a TV, with the amber ring and the design's 1.04 press
// scale already wired. The design itself lives in button-variants.ts.

import { type ReactNode, useMemo } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { Box } from '#ui/components/atoms/box';
import { Focusable, type FocusableProps } from '#ui/components/atoms/focusable';
import { useFrostCoat } from '#ui/components/atoms/frost';
import { Icon, type IconName, type IconProps } from '#ui/components/atoms/icon';
import { Spinner } from '#ui/components/atoms/spinner';
import { Text } from '#ui/components/atoms/text';
import { useGroupMember } from '#ui/lib/group-shape';
import {
  type ButtonSize,
  type ButtonVariant,
  buttonVariants,
  CONTENT_GAP,
  FROSTED,
  UNFILLED,
} from './button-variants';

interface ButtonProps
  extends Omit<FocusableProps, 'children' | 'style' | 'focusScale' | 'label' | 'ring' | 'busy'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the width of the parent. */
  block?: boolean;
  /** The active coat, which only the `outline` variant paints. It is paint and
   *  nothing else: a button that toggles something says so with `pressed`,
   *  which is what assistive tech hears. */
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
  const s = buttonVariants({ variant, size: shell, block, active }, { disabled });
  const frost = useFrostCoat([s.root, style], {
    on: FROSTED.has(variant) || (disabled && !UNFILLED.has(variant)),
  });
  const box = useMemo(() => [frost.style, group.style, style], [frost.style, group.style, style]);
  return (
    <Focusable
      {...focusProps}
      onPress={loading ? undefined : onPress}
      onFocus={group.onFocus}
      onBlur={group.onBlur}
      disabled={disabled}
      inert={loading}
      busy={loading || undefined}
      focusScale={focusScale ?? (group.grouped ? 1 : 1.04)}
      label={label}
      sv={buttonVariants}
      vars={{ variant, size: shell, block, active }}
      style={box}
    >
      {(state) => (
        <>
          {frost.layer}
          <Dimmable dim={disabled}>
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
          </Dimmable>
        </>
      )}
    </Focusable>
  );
}

// A disabled button fades its ink as ONE group, so an icon's own strokes never
// double-paint - and the fill's alpha stays above that group, or the frost
// child would have nothing left to blur.
function Dimmable({ dim, children }: Readonly<{ dim: boolean; children: ReactNode }>) {
  if (!dim) return children;
  return (
    <Box row center gap={CONTENT_GAP} opacity={0.5}>
      {children}
    </Box>
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
      {label === undefined ? null : <Text style={labelStyle}>{label}</Text>}
      {children}
      {iconRight ? <Icon name={iconRight} {...glyph} /> : null}
    </>
  );
}

export type { ButtonProps, ButtonSize, ButtonVariant };
export { Button, buttonVariants };
