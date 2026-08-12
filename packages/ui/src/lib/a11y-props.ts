// The vocabulary both halves of the a11y split speak (see a11y.ts): what a
// control can claim about itself, and the two prop shapes those claims take.
// Shared rather than declared twice, so the twins cannot drift.

import type { AccessibilityState, AccessibilityValue } from 'react-native';

/** What a control claims about itself. `pressed` is a toggle button's on state,
 *  which ARIA spells `aria-pressed` and React Native does not have: its
 *  platforms read `selected`, which VoiceOver and TalkBack both announce for a
 *  control that is switched on. */
export interface A11yFlags extends AccessibilityState {
  pressed?: boolean;
}

/** Spread onto the control. Only one platform's half is ever filled in; the
 *  type carries both because a caller compiles against whichever resolves. */
export interface A11yProps {
  accessibilityState?: AccessibilityState;
  accessibilityValue?: AccessibilityValue;
  'aria-busy'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-disabled'?: boolean;
  'aria-expanded'?: boolean;
  'aria-pressed'?: boolean;
  'aria-selected'?: boolean;
  'aria-valuemax'?: number;
  'aria-valuemin'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
}
