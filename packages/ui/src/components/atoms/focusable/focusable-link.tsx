import type { ReactNode } from 'react';
import { cloneHost } from '#ui/lib/slot';
import { hostRole } from './focusable-a11y';
import { hostFor } from './focusable-delegate';
import { coatStack } from './focusable-paint';
import type { FocusableProps, HostAt } from './focusable-types';

// One click handler, the delegate's. A second would navigate twice, and would
// take the cmd, ctrl, shift and middle clicks the browser answers itself.
function LinkForm({
  child,
  at,
}: Readonly<{ child: FocusableProps['children']; at: HostAt }>): ReactNode {
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
  const host = hostFor(child, {
    focused: at.focused,
    pressed: at.pressed,
    hovered: at.hovered,
    slots: at.resolve(at.pressed),
  });
  return cloneHost(host, {
    ref: at.setBox,
    style: painted,
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
  });
}

export { LinkForm };
