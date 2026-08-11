/**
 * Shared style atoms for the settings sub-panels.
 *
 * Focus is state-driven: a row picks its `*On` / `*Off` style from a boolean,
 * never from CSS `:hover` or `:focus`.
 *
 * The `On` styles carry the lift as well as the ring, the same step <Focusable>
 * takes: the ring stands off the row and the row below it, drawn later, would
 * otherwise paint over that side of it.
 *
 * One live set rather than a constant per name: `styles()` re-resolves against
 * the active theme, so the focus ring and the inks follow a swap — a bag of
 * module constants would keep the palette of module-load time.
 */

import type { ViewStyle } from 'react-native';
import { styles } from '#ui/core';

const ROW_BASE = { w: '100%', row: true, align: 'center', radius: 'lg', px: 22, py: 18 } as const;

export const panel = styles({
  panelList: { gap: 10 },

  selectRow: { ...ROW_BASE, gap: 16 },
  selectLabel: { text: 'labelTv', color: 'text' },
  selectSub: { text: 'metaTv', mt: 2, color: 'text/50' },

  menuRow: { ...ROW_BASE, gap: 18 },
  menuLabel: { text: 'strongTv', color: 'text' },
  menuValue: { text: 'metaTv', mt: 2, color: 'text/50' },

  valueRow: { radius: 'lg', px: 22, py: 16 },
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
