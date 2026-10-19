import type { AccessibilityRole } from 'react-native';
import { WEB } from './platform';

type ControlRole = AccessibilityRole | 'option';

/** The role the platform can be handed: the real ARIA role on the web, the nearest one Android's `fromValue` accepts on native. */
export function platformRole(role: ControlRole): AccessibilityRole {
  if (WEB) return role as AccessibilityRole;
  return role === 'option' ? 'menuitem' : role;
}

/** The role a host element states for itself: none for a link the browser renders as `<a href>`. */
export function hostRole(role: ControlRole): AccessibilityRole | undefined {
  return WEB && role === 'link' ? undefined : platformRole(role);
}

/** The props that make a control an anchor where there is one, else null. */
export function linkProps(href: string | undefined, role: ControlRole): object | null {
  if (!WEB || !href) return null;
  return { href, accessibilityRole: hostRole(role) };
}

/** `aria-current` where the platform reads it, else null. */
export function currentMark(current: string | boolean | undefined): object | null {
  return WEB && current ? { 'aria-current': current } : null;
}
