// What a control says about itself beyond its role, in the shape React Native
// reads: the `accessibilityState` and `accessibilityValue` OBJECTS. The browser
// targets take the other half of this split (see a11y.web.ts), because
// react-native-web reads flat `aria-*` props and drops both objects on the
// floor - which is how a checked switch, a selected row and a seek bar's
// position all went out with their role and without their state.

import type { AccessibilityValue } from 'react-native';
import type { A11yFlags, A11yProps } from './a11y-props';

export type { A11yFlags, A11yProps };

/** Spread onto the control that HAS the state, never onto a face inside it. */
export function a11yState({ pressed, ...state }: A11yFlags): A11yProps {
  return { accessibilityState: pressed === undefined ? state : { ...state, selected: pressed } };
}

/** Spread onto an `adjustable` control: where its value sits in its range, and
 *  optionally how to say that in words. */
export function a11yValue(value: AccessibilityValue): A11yProps {
  return { accessibilityValue: value };
}
