import type { AccessibilityRole, AccessibilityValue } from 'react-native';
import { type A11yFlags, a11yState, a11yValue } from '#ui/lib/a11y';
import { WEB } from '#ui/lib/platform';
import type { A11yState, FocusCurrent, FocusRole } from './focusable-types';

function claimProps(
  state: A11yFlags,
  value: AccessibilityValue | undefined,
  current?: FocusCurrent,
): A11yState {
  const claimed = Object.values(state).some((claim) => claim !== undefined);
  const mark = WEB && current ? { 'aria-current': current } : null;
  if (!claimed && !value && !mark) return undefined;
  return {
    ...(claimed ? a11yState(state) : null),
    ...(value ? a11yValue(value) : null),
    ...mark,
  };
}

/** What the platform can be handed: the web keeps the real ARIA role, native
 *  gets the nearest value Android's `fromValue` accepts. */
function platformRole(role: FocusRole): AccessibilityRole {
  if (WEB) return role as AccessibilityRole;
  return role === 'option' ? 'menuitem' : role;
}

function linkProps(href: string | undefined, role: FocusRole): object | null {
  if (!WEB || !href) return null;
  return role === 'link' ? { href, accessibilityRole: undefined } : { href };
}

export { claimProps, linkProps, platformRole };
