/**
 * Shared style atoms for the settings sub-panels. A row is a <Focusable>, so its
 * ring and lift are the kit's; {@link ROW_FOCUS} is the wash it adds.
 *
 * One live set rather than a constant per name: `styles()` re-resolves against
 * the active theme, so the focus ring and the inks follow a swap. A bag of
 * module constants would keep the palette of module-load time.
 */

import type { ViewStyle } from 'react-native';
import { styles } from '#ui/core';

/** The wash a focused panel row wears under the kit's ring. */
export const ROW_FOCUS = { focus: { bg: 'tint/10' } } as const;

/** The wash a focused value row wears under the kit's ring. */
export const VALUE_ROW_FOCUS = { focus: { bg: 'tint/8' } } as const;

const ROW_BASE = { w: '100%', row: true, align: 'center', radius: 'xl', px: 22, py: 18 } as const;

export const panel = styles({
  panelList: { gap: 10 },

  selectRow: { ...ROW_BASE, gap: 16 },
  selectLabel: { text: 'labelTv', color: 'text' },
  selectSub: { text: 'metaTv', mt: 2, color: 'text/50' },

  menuRow: { ...ROW_BASE, gap: 18 },
  menuLabel: { text: 'strongTv', color: 'text' },
  menuValue: { text: 'metaTv', mt: 2, color: 'text/50' },

  valueRow: { radius: 'xl', px: 22, py: 16 },
  valueRowOn: { bg: 'tint/8', ring: 'focusLift', z: 1 },
  valueLabel: { text: 'sectionTv', color: 'text' },

  panelHint: { mt: 12, mx: 2, text: 'captionTv', color: 'text/50' },
  panelEmpty: { px: 2, py: 4, text: 'captionTv', color: 'textDim' },

  rowOn: { bg: 'tint/10', ring: 'focusLift', z: 1 },
  rowOff: { bg: 'transparent' },

  pill: { radius: 'sm', py: 9, bg: 'tint/6' },
  pillLabel: { text: 'footnoteTv' },
});

export const rowStyle = (base: ViewStyle, on: ViewStyle, focused: boolean): ViewStyle[] => [
  base,
  focused ? on : panel.rowOff,
];
