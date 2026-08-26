import { cloneElement, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { hostRole } from './focusable-a11y';
import { coatStack } from './focusable-paint';
import type { HostAt, HostElement } from './focusable-types';

// One click handler, the delegate's. A second would navigate twice, and would
// take the cmd, ctrl, shift and middle clicks the browser answers itself.
function LinkForm({ as, at }: Readonly<{ as: HostElement; at: HostAt }>): ReactNode {
  const painted = coatStack({
    base: at.style,
    hovered: at.hovered,
    hoveredStyle: at.hoveredStyle,
    pressed: at.pressed,
    pressedStyle: at.pressedStyle,
    focusVisible: at.focusVisible,
    focusedStyle: at.focusedStyle,
    lifted: at.focused,
    showRing: at.showRing,
    ringToken: at.ringToken,
    animated: at.animated,
  });
  return cloneElement(as, {
    ref: at.setBox,
    // Flattened, not the array. A router link merges the style it is handed into
    // its own active-state style with an object spread, which turns an array
    // into `{ 0: …, 1: … }`.
    style: StyleSheet.flatten(painted),
    accessibilityRole: hostRole(at.role),
    accessibilityLabel: at.label,
    ...at.a11yState,
    onLayout: at.onLayout,
    onFocus: at.onFocus,
    onBlur: at.onBlur,
    onPointerEnter: at.onHoverIn,
    onPointerLeave: at.onHoverOut,
    onPointerDown: at.onPointerDown,
    onPointerUp: at.onPointerUp,
    onPointerCancel: at.onPointerUp,
    // Omitted entirely when this control has none of its own: cloneElement
    // copies the key over, so passing `undefined` would erase whatever the
    // delegated element was already carrying.
    ...(at.children === undefined
      ? null
      : {
          children:
            typeof at.children === 'function'
              ? at.children({
                  focused: at.focused,
                  pressed: at.pressed,
                  hovered: at.hovered,
                  slots: at.resolve(at.pressed),
                })
              : at.children,
        }),
  });
}

export { LinkForm };
