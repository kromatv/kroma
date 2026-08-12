// The browser half of the a11y split (see a11y.ts): react-native-web forwards
// flat `aria-*` props and ignores React Native's `accessibilityState` and
// `accessibilityValue` objects entirely.

import type { AccessibilityValue } from 'react-native';
import type { A11yFlags, A11yProps } from './a11y-props';

export type { A11yFlags, A11yProps };

export function a11yState(state: A11yFlags): A11yProps {
  return {
    'aria-busy': state.busy,
    'aria-checked': state.checked,
    'aria-disabled': state.disabled,
    'aria-expanded': state.expanded,
    // Here the web keeps the role ARIA has for a toggle button, where native
    // falls back to `selected` (see a11y.ts).
    'aria-pressed': state.pressed,
    'aria-selected': state.selected,
  };
}

export function a11yValue(value: AccessibilityValue): A11yProps {
  return {
    'aria-valuemax': value.max,
    'aria-valuemin': value.min,
    'aria-valuenow': value.now,
    'aria-valuetext': value.text,
  };
}
