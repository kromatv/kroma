/**
 * Shared style atoms for the settings sub-panels, so every list, row, hint and
 * value row looks identical across Quality / Audio / Subtitles / Speed /
 * Appearance. React Native styles, so the one panel renders on a TV and in a
 * browser alike.
 *
 * Focus is STATE-driven (a pointer moves focus exactly like the D-pad, §15): a
 * row picks its `*On` / `*Off` style from a boolean, never from CSS :hover or
 * :focus. `rowStyle` is what composes the two.
 */

import type { TextStyle, ViewStyle } from 'react-native';
import { FOCUS_SHADOW_SM } from '#ui/components/organisms/player/lib/style';
import { colors, fonts } from '#ui/lib/tokens';

/** Vertical stack of selectable rows (design gap: 10px). */
export const panelList: ViewStyle = { gap: 10 };

const ROW_BASE: ViewStyle = {
  width: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 14,
  paddingHorizontal: 22,
  paddingVertical: 18,
};

/** A selectable sub-list row (Quality / Audio / Subtitles / Speed): icon-free,
 * label (+ optional sub-line) on the left, an accent check when active. */
export const selectRow: ViewStyle = { ...ROW_BASE, gap: 16 };
export const selectLabel: TextStyle = {
  fontFamily: fonts.ui,
  fontWeight: '600',
  fontSize: 20,
  lineHeight: 25,
  color: colors.text,
};
export const selectSub: TextStyle = {
  fontFamily: fonts.ui,
  fontWeight: '500',
  fontSize: 14,
  lineHeight: 18,
  marginTop: 2,
  color: 'rgba(244, 243, 240, 0.5)',
};

/** A main-menu row: leading icon, bold label + current value, trailing control. */
export const menuRow: ViewStyle = { ...ROW_BASE, gap: 18 };
export const menuLabel: TextStyle = {
  fontFamily: fonts.ui,
  fontWeight: '700',
  fontSize: 21,
  lineHeight: 26,
  color: colors.text,
};
export const menuValue: TextStyle = {
  fontFamily: fonts.ui,
  fontWeight: '500',
  fontSize: 15,
  lineHeight: 19,
  marginTop: 2,
  color: 'rgba(244, 243, 240, 0.5)',
};

/** An appearance / wizard value row (label + arrows header, control below). */
export const valueRow: ViewStyle = { borderRadius: 14, paddingHorizontal: 22, paddingVertical: 16 };
export const valueRowOn: ViewStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  boxShadow: FOCUS_SHADOW_SM,
};
export const valueLabel: TextStyle = {
  fontFamily: fonts.ui,
  fontWeight: '700',
  fontSize: 15,
  color: colors.text,
};

/** A muted hint paragraph under a control group. */
export const panelHint: TextStyle = {
  marginTop: 12,
  marginHorizontal: 2,
  fontFamily: fonts.ui,
  fontSize: 15,
  fontWeight: '500',
  lineHeight: 24,
  color: 'rgba(244, 243, 240, 0.5)',
};

/** Empty-state line (no audio tracks / no source subtitle). */
export const panelEmpty: TextStyle = {
  paddingHorizontal: 2,
  paddingVertical: 4,
  fontFamily: fonts.ui,
  fontSize: 15,
  color: 'rgba(244, 243, 240, 0.45)',
};

/** The focus treatment shared by the select rows and the main-menu rows, and the
 * resting state shared by every row. One pair, so a designer retuning either
 * cannot miss a copy. The appearance rows keep their own softer `valueRowOn`. */
export const rowOn: ViewStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  boxShadow: FOCUS_SHADOW_SM,
};
export const rowOff: ViewStyle = { backgroundColor: 'transparent' };

/** Compose a row's base + focus/idle style on the `focused` boolean. */
export const rowStyle = (base: ViewStyle, on: ViewStyle, focused: boolean): ViewStyle[] => [
  base,
  focused ? on : rowOff,
];

/** The unselected pill of the settings surface: the segmented control's options
 * and the named-value row wear the same one, so retuning it is one edit. */
export const pill = {
  borderRadius: 9,
  paddingVertical: 9,
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
} as const;

/** The label inside a `pill`. */
export const pillLabel = { fontFamily: fonts.ui, fontWeight: '700' as const, fontSize: 13 };
