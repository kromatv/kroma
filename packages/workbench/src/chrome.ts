// The style constants every piece of workbench chrome shares.

import { colors, radius } from '@kroma/ui/tokens';

export const RULE = { borderBottomWidth: 1, borderBottomColor: colors.border } as const;

export const RULE_TOP = { borderTopWidth: 1, borderTopColor: colors.border } as const;

export const FOCUS_WASH = { backgroundColor: 'rgba(255, 255, 255, 0.06)' } as const;

/** For a row in an open menu, where the surface underneath is already lifted and
 * the plain wash reads as nothing. */
export const FOCUS_WASH_STRONG = { backgroundColor: 'rgba(255, 255, 255, 0.07)' } as const;

// Square at the bottom and pulled down a pixel so the active underline lands on
// the rule below it.
export const TAB = {
  paddingVertical: 11,
  paddingHorizontal: 12,
  marginBottom: -1,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  borderTopLeftRadius: radius.sm,
  borderTopRightRadius: radius.sm,
} as const;

export const TAB_ACTIVE = { borderBottomColor: colors.accent } as const;
