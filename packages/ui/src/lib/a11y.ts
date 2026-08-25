// What a control says about itself beyond its role. The two targets read it in
// different shapes and neither reads the other's: React Native wants the
// `accessibilityState` and `accessibilityValue` OBJECTS, while
// react-native-web forwards flat `aria-*` props and drops both objects on the
// floor, which is how a checked switch, a selected row and a seek bar's
// position all went out with their role and without their state.

import type { AccessibilityValue } from 'react-native';
import type { A11yFlags, A11yProps } from './a11y-props';
import { WEB } from './platform';

export type { A11yFlags, A11yProps };

/** Spread onto the control that HAS the state, never onto a face inside it. */
export function a11yState({ pressed, ...state }: A11yFlags): A11yProps {
  if (WEB) {
    return {
      'aria-busy': state.busy,
      'aria-checked': state.checked,
      'aria-disabled': state.disabled,
      'aria-expanded': state.expanded,
      // The web keeps the role ARIA has for a toggle button, where native falls
      // back to `selected`.
      'aria-pressed': pressed,
      'aria-selected': state.selected,
    };
  }
  return { accessibilityState: pressed === undefined ? state : { ...state, selected: pressed } };
}

/** Spread onto an `adjustable` control: where its value sits in its range, and
 *  optionally how to say that in words. */
export function a11yValue(value: AccessibilityValue): A11yProps {
  if (WEB) {
    return {
      'aria-valuemax': value.max,
      'aria-valuemin': value.min,
      'aria-valuenow': value.now,
      'aria-valuetext': value.text,
    };
  }
  return { accessibilityValue: value };
}
