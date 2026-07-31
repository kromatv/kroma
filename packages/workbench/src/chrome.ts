// The style constants every piece of workbench chrome shares.

import { styles } from '@kroma/ui/kit';
import { radius } from '@kroma/ui/tokens';

export const { RULE, RULE_TOP } = styles({
  RULE: { borderBottomWidth: 1, borderBottomColor: 'border' },
  RULE_TOP: { borderTopWidth: 1, borderTopColor: 'border' },
});

// Square at the bottom and pulled down a pixel so the active underline lands on
// the rule below it. Spread into a recipe rather than passed to `style`, so it
// stays a plain object.
export const TAB = {
  paddingVertical: 11,
  paddingHorizontal: 12,
  marginBottom: -1,
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
  borderTopLeftRadius: radius.sm,
  borderTopRightRadius: radius.sm,
} as const;
