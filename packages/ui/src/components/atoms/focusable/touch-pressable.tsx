import type { ReactNode, Ref } from 'react';
import {
  type Insets,
  type LayoutChangeEvent,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { useControlDip } from '#ui/lib/control-platform';
import { linkProps, platformRole } from '#ui/lib/control-role';
import { UNFOCUSABLE } from '#ui/lib/focus-types';
import type { PressScale } from '#ui/lib/press-dip';
import { PointerFace } from '#ui/lib/pointer-face';
import { PressHost } from '#ui/lib/press-host';
import type { A11yState, FocusRole, WebKeys } from './focusable-types';

// On a television the Pressable must be `unfocusable`: a view the platform can
// focus swallows the directional presses and the remote goes dead (see
// lib/focus-root).
function Painted({
  painted,
  pressedStyle,
  onPress,
  onLongPress,
  hitSlop,
  role,
  a11yState,
  render,
}: Readonly<{
  painted: StyleProp<ViewStyle>[];
  pressedStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  hitSlop?: number | Insets;
  role: FocusRole;
  a11yState: A11yState;
  render: (pressed: boolean) => ReactNode;
}>) {
  return (
    <PointerFace
      style={painted}
      render={render}
      touch={(unfocusable) => (
        <TouchPressable
          base={painted}
          pressedStyle={pressedStyle}
          onPress={onPress}
          onLongPress={onLongPress}
          hitSlop={hitSlop}
          role={role}
          a11yState={a11yState}
          unfocusable={unfocusable}
        >
          {(pressed) => render(pressed)}
        </TouchPressable>
      )}
    />
  );
}

// The press dip measures the box too; both readings come off one element.
function boxLayout(
  dip: PressScale,
  own: ((event: LayoutChangeEvent) => void) | undefined,
): ((event: LayoutChangeEvent) => void) | undefined {
  const measure = dip.onLayout;
  if (!measure) return own;
  return (event: LayoutChangeEvent) => {
    measure(event);
    own?.(event);
  };
}

function TouchPressable({
  base,
  pressedStyle,
  onPress,
  onLongPress,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  onLayout,
  hitSlop,
  unfocusable = false,
  label,
  role = 'button',
  a11yState,
  webKeys,
  href,
  boxRef,
  children,
}: Readonly<{
  base: StyleProp<ViewStyle>[];
  pressedStyle?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  hitSlop?: number | Insets;
  unfocusable?: boolean;
  label?: string;
  role?: FocusRole;
  a11yState: A11yState;
  webKeys?: WebKeys;
  href?: string;
  boxRef?: Ref<View>;
  children: (pressed: boolean) => ReactNode;
}>) {
  const dip = useControlDip();
  return (
    <PressHost
      ref={boxRef}
      {...(unfocusable ? (UNFOCUSABLE as object) : (webKeys ?? null))}
      accessibilityRole={platformRole(role)}
      {...linkProps(href, role)}
      {...a11yState}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      onFocus={onFocus}
      onBlur={onBlur}
      hitSlop={hitSlop}
      onLayout={boxLayout(dip, onLayout)}
      onPressIn={dip.onPressIn}
      onPressOut={dip.onPressOut}
      style={[...base, dip.pressed ? pressedStyle : null, dip.style]}
    >
      {children(dip.pressed)}
    </PressHost>
  );
}

export { Painted, TouchPressable };
