import type { NodeHandle } from '@kromatv/spatial-nav/react';
import type { ReactNode, RefObject } from 'react';
import type { StyleProp, View, ViewStyle } from 'react-native';
import type { AnySv } from '#ui/core';
import type { RingToken } from '#ui/core/theme';
import type { splitBoxLayers } from '#ui/lib/box-layers';
import { StillHost } from '#ui/lib/control-platform';
import { linkProps, platformRole } from '#ui/lib/control-role';
import type { FocusServices } from '#ui/lib/focus-services';
import { useControlledMirror } from '#ui/lib/controlled-focus-mirror';
import { faceLift, NavigatorItemHost } from '#ui/lib/navigator-item-host';
import { GROUNDED, LIFTED } from '#ui/lib/focus-lift';
import { useCoatStack, useFocusRing } from './focusable-paint';
import type {
  A11yState,
  FocusableProps,
  FocusRole,
  Resolve,
  TouchAt,
  WebKeys,
} from './focusable-types';
import { Painted, TouchPressable } from './touch-pressable';
import { useMirroredFocus } from './use-mirrored-focus';

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
    <StillHost
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
    </StillHost>
  );
}

function TouchForm({ at }: Readonly<{ at: TouchAt }>): ReactNode {
  // Not `at.controlled &&`: an uncontrolled control on a browser target reports
  // its own DOM focus (the pressable forwards it), and a keyboard reaching it is
  // the one thing a ring exists for. Gating this on `controlled` left every
  // control in a pointer-driven shell with no focus state at all, and the page
  // sheet's `:focus-visible` rule drawing a square outline in its place.
  const lit = at.focusVisible;
  const ring = useFocusRing(at.ringToken);
  const box = useControlledMirror(at.controlled && at.focused, at.setBox);
  // Hover goes UNDER the focus coats: a control the cursor is over and the
  // remote is on is a focused control, not a doubly-lit one.
  const hover = at.hovered ? at.hoveredStyle : null;
  const base = [
    at.style,
    hover,
    lit ? at.focusedStyle : null,
    lit ? LIFTED : GROUNDED,
    lit && at.showRing ? ring : null,
    at.animated,
  ];
  return (
    <TouchPressable
      boxRef={box}
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

function NavigatorForm({
  entry,
  at,
}: Readonly<{
  entry: RefObject<NodeHandle | null>;
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
    mirror: FocusServices['mirror'];
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
    onLongSelect: (() => void) | undefined;
    hitSlop: FocusableProps['hitSlop'];
    resolve: Resolve;
    children: FocusableProps['children'];
  };
}>): ReactNode {
  const painted = useCoatStack({
    base: at.layers ? at.layers.face : at.style,
    hovered: at.hovered,
    hoveredStyle: at.hoveredStyle,
    pressed: at.pressed,
    pressedStyle: at.pressedStyle,
    focusVisible: at.focusVisible,
    focusedStyle: at.focusedStyle,
    lifted: faceLift(at.focused),
    showRing: at.showRing,
    ringToken: at.ringToken,
    animated: at.animated,
  });
  const mirror = useMirroredFocus(at.setBox, at.handleFocus, at.mirror);

  const render = (focused: boolean, pressed: boolean) =>
    typeof at.children === 'function'
      ? at.children({ focused, pressed, hovered: at.hovered, slots: at.resolve(pressed) })
      : at.children;

  return (
    <NavigatorItemHost
      entry={entry}
      onSelect={at.press}
      onLongSelect={at.onLongSelect}
      onFocus={mirror.focus}
      onBlur={at.handleBlur}
      painted={painted}
      layers={at.layers}
      focused={at.focused}
      pressed={at.pressed}
      viewProps={{
        accessibilityRole: platformRole(at.role),
        ...(at.a11yState as object | undefined),
        ...linkProps(at.href, at.role),
        ...(at.webKeys ?? null),
        accessibilityLabel: at.label,
        onLayout: at.onLayout,
        ref: mirror.ref,
      }}
      pointer={{
        onHoverIn: at.onHoverIn,
        onHoverOut: at.onHoverOut,
        onPointerDown: at.onPointerDown,
        onPointerUp: at.onPointerUp,
      }}
      render={render}
      renderFace={(focused, face) => (
        <Painted
          painted={face}
          pressedStyle={at.pressedStyle}
          onPress={at.pointerPress}
          onLongPress={at.onLongPress}
          hitSlop={at.hitSlop}
          role={at.role}
          a11yState={at.a11yState}
          render={(pressed) => render(focused, pressed)}
        />
      )}
    />
  );
}

export { DisabledForm, NavigatorForm, TouchForm };
