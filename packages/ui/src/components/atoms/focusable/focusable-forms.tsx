import type { ComponentProps, ReactNode, RefObject } from 'react';
import { Animated, type StyleProp, StyleSheet, type View, type ViewStyle } from 'react-native';
import {
  SpatialNavigationFocusableView,
  type SpatialNavigationNodeRef,
} from 'react-tv-space-navigation';
import type { AnySv } from '#ui/core';
import type { RingToken } from '#ui/core/theme';
import type { splitBoxLayers } from '#ui/lib/box-layers';
import { GROUNDED, LIFTED } from '#ui/lib/focus-lift';
import { WEB } from '#ui/lib/platform';
import { linkProps, platformRole } from './focusable-a11y';
import { coatStack, focusRing } from './focusable-paint';
import type {
  A11yState,
  FocusableProps,
  FocusRole,
  Resolve,
  TouchAt,
  WebKeys,
} from './focusable-types';
import { Painted, TouchPressable } from './touch-pressable';

// The navigator's `style` type follows whichever react-native copy the consuming
// app resolves (the tvos fork on a TV, mainline on the phone), and those two are
// not assignable to each other.
type NavigatorStyle = ComponentProps<typeof SpatialNavigationFocusableView>['style'];
const flat = (style: StyleProp<ViewStyle>[]): NavigatorStyle =>
  StyleSheet.flatten(style) as NavigatorStyle;

type NavigatorViewProps = ComponentProps<typeof SpatialNavigationFocusableView>['viewProps'];

function DisabledForm({
  at,
}: Readonly<{
  at: {
    role: FocusRole;
    disabledState: A11yState;
    label: string | undefined;
    onLayout: FocusableProps['onLayout'];
    style: StyleProp<ViewStyle>;
    focusedStyle: ViewStyle | undefined;
    animated: FocusableProps['style'];
    focused: boolean;
    hovered: boolean;
    slots: ReturnType<AnySv>;
    children: FocusableProps['children'];
  };
}>): ReactNode {
  return (
    <Animated.View
      accessibilityRole={platformRole(at.role)}
      {...at.disabledState}
      accessibilityLabel={at.label}
      onLayout={at.onLayout}
      style={[at.style, at.focused ? at.focusedStyle : null, at.animated]}
    >
      {typeof at.children === 'function'
        ? at.children({
            focused: at.focused,
            pressed: false,
            hovered: at.hovered,
            slots: at.slots,
          })
        : at.children}
    </Animated.View>
  );
}

function TouchForm({ at }: Readonly<{ at: TouchAt }>): ReactNode {
  // Not `at.controlled &&`: an uncontrolled control on a browser target reports
  // its own DOM focus (the pressable forwards it), and a keyboard reaching it is
  // the one thing a ring exists for. Gating this on `controlled` left every
  // control in a pointer-driven shell with no focus state at all, and the page
  // sheet's `:focus-visible` rule drawing a square outline in its place.
  const lit = at.focusVisible;
  // Hover goes UNDER the focus coats: a control the cursor is over and the
  // remote is on is a focused control, not a doubly-lit one.
  const hover = at.hovered ? at.hoveredStyle : null;
  const base = [
    at.style,
    hover,
    lit ? at.focusedStyle : null,
    lit ? LIFTED : GROUNDED,
    lit && at.showRing ? focusRing(at.ringToken) : null,
    at.animated,
  ];
  return (
    <TouchPressable
      boxRef={at.setBox}
      webKeys={at.webKeys}
      href={at.href}
      label={at.label}
      onLayout={at.onLayout}
      role={at.role}
      a11yState={at.a11yState}
      base={base}
      pressedStyle={at.pressedStyle}
      onPress={at.onPress}
      onLongPress={at.onLongPress}
      onHoverIn={at.onHoverIn}
      onHoverOut={at.onHoverOut}
      onFocus={at.onFocus}
      onBlur={at.onBlur}
      hitSlop={at.hitSlop}
      {...(at.controlled ? { unfocusable: true } : null)}
    >
      {(pressed) =>
        typeof at.children === 'function'
          ? at.children({
              focused: at.focused,
              pressed,
              hovered: at.hovered,
              slots: at.resolve(pressed),
            })
          : at.children
      }
    </TouchPressable>
  );
}

// The outer view is the one the parent orders, so the lift has to ride there:
// the painted face inside it is an only child and outranks nothing.
function liftedBox(
  layers: ReturnType<typeof splitBoxLayers> | null,
  focused: boolean,
): NavigatorStyle {
  const box = layers?.box;
  return flat([box, focused ? LIFTED : GROUNDED]);
}

function NavigatorForm({
  entry,
  at,
}: Readonly<{
  entry: RefObject<SpatialNavigationNodeRef | null>;
  at: {
    onLayout: FocusableProps['onLayout'];
    webKeys: WebKeys;
    href: string | undefined;
    layers: ReturnType<typeof splitBoxLayers> | null;
    style: FocusableProps['style'];
    focusedStyle: ViewStyle | undefined;
    animated: FocusableProps['style'];
    showRing: boolean;
    ringToken: RingToken;
    focused: boolean;
    focusVisible: boolean;
    hovered: boolean;
    press: () => void;
    pointerPress: () => void;
    handleFocus: () => void;
    handleBlur: () => void;
    setBox: (view: View | null) => void;
    label: string | undefined;
    role: FocusRole;
    a11yState: A11yState;
    pressed: boolean;
    pressedStyle: StyleProp<ViewStyle>;
    hoveredStyle: ViewStyle | undefined;
    onHoverIn: () => void;
    onHoverOut: () => void;
    onPointerDown: () => void;
    onPointerUp: () => void;
    onLongPress: FocusableProps['onLongPress'];
    hitSlop: FocusableProps['hitSlop'];
    resolve: Resolve;
    children: FocusableProps['children'];
  };
}>): ReactNode {
  const painted = coatStack({
    base: at.layers ? at.layers.face : at.style,
    hovered: at.hovered,
    hoveredStyle: at.hoveredStyle,
    pressed: at.pressed,
    pressedStyle: at.pressedStyle,
    focusVisible: at.focusVisible,
    focusedStyle: at.focusedStyle,
    lifted: WEB && at.focused,
    showRing: at.showRing,
    ringToken: at.ringToken,
    animated: at.animated,
  });

  return (
    <SpatialNavigationFocusableView
      ref={entry}
      onSelect={at.press}
      onFocus={at.handleFocus}
      onBlur={at.handleBlur}
      // On the browser targets the control is ONE element: a second view per
      // control is a cost Tizen pays on every focus move. The native builds keep
      // the inner view because their focus scale is a real Animated value.
      style={WEB ? flat(painted) : liftedBox(at.layers, at.focused)}
      viewProps={
        {
          accessibilityRole: platformRole(at.role),
          ...(at.a11yState as object | undefined),
          ...linkProps(at.href, at.role),
          ...(at.webKeys ?? null),
          accessibilityLabel: at.label,
          onLayout: at.onLayout,
          ref: at.setBox,
          // Browser targets only: this view is a plain <View>, so there is no
          // hover callback to lean on and react-native-web forwards these two
          // straight to the element.
          ...(WEB
            ? {
                onPointerEnter: at.onHoverIn,
                onPointerLeave: at.onHoverOut,
                onPointerDown: at.onPointerDown,
                onPointerUp: at.onPointerUp,
                onPointerCancel: at.onPointerUp,
              }
            : null),
        } as NavigatorViewProps
      }
    >
      {({ isFocused }: { isFocused: boolean }) => {
        const render = (pressed: boolean) =>
          typeof at.children === 'function'
            ? at.children({
                focused: isFocused,
                pressed,
                hovered: at.hovered,
                slots: at.resolve(pressed),
              })
            : at.children;
        if (WEB) return <>{render(at.pressed)}</>;
        return (
          <Painted
            painted={painted}
            pressedStyle={at.pressedStyle}
            onPress={at.pointerPress}
            onLongPress={at.onLongPress}
            hitSlop={at.hitSlop}
            role={at.role}
            a11yState={at.a11yState}
            render={render}
          />
        );
      }}
    </SpatialNavigationFocusableView>
  );
}

export { DisabledForm, NavigatorForm, TouchForm };
