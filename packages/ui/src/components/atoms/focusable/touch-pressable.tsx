import type { ReactNode, Ref } from 'react';
import {
  Animated,
  type Insets,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import { usePressScale } from '#ui/lib/focus-transition';
import { UNFOCUSABLE } from '#ui/lib/focus-types';
import { linkProps, platformRole } from './focusable-a11y';
import type { A11yState, FocusRole, WebKeys } from './focusable-types';

// Android TV boxes ship air mice and trackpad remotes; tvOS has no pointer
// device at all, so it keeps the plain view and none of the Pressable's cost.
const TV_HAS_POINTER = Platform.isTV && Platform.OS === 'android';

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
  if (Platform.isTV && !TV_HAS_POINTER) {
    return <Animated.View style={painted}>{render(false)}</Animated.View>;
  }
  // The navigator answers to a remote and to a click, but not to a finger. This
  // is the only place a tap becomes a press.
  return (
    <TouchPressable
      base={painted}
      pressedStyle={pressedStyle}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={hitSlop}
      role={role}
      a11yState={a11yState}
      unfocusable={Platform.isTV}
    >
      {(pressed) => render(pressed)}
    </TouchPressable>
  );
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
  const dip = usePressScale();
  return (
    <AnimatedPressable
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
      // The press dip measures the box too; both readings come off one element.
      onLayout={(event: LayoutChangeEvent) => {
        dip.onLayout(event);
        onLayout?.(event);
      }}
      onPressIn={dip.onPressIn}
      onPressOut={dip.onPressOut}
      style={[...base, dip.pressed ? pressedStyle : null, dip.style]}
    >
      {children(dip.pressed)}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export { Painted, TouchPressable, TV_HAS_POINTER };
