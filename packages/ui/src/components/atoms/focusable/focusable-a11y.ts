import type { AccessibilityValue } from 'react-native';
import { currentMark } from '#ui/lib/control-role';
import { type A11yFlags, a11yState, a11yValue } from '#ui/lib/a11y';
import type { A11yState, FocusCurrent } from './focusable-types';

function claimProps(
  state: A11yFlags,
  value: AccessibilityValue | undefined,
  current?: FocusCurrent,
): A11yState {
  const claimed = Object.values(state).some((claim) => claim !== undefined);
  const mark = currentMark(current);
  if (!claimed && !value && !mark) return undefined;
  return {
    ...(claimed ? a11yState(state) : null),
    ...(value ? a11yValue(value) : null),
    ...mark,
  };
}

export { claimProps };
