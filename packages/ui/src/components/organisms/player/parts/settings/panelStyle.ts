/**
 * Shared style atoms for the settings sub-panels.
 *
 * Focus is state-driven: a row picks its `*On` / `*Off` style from a boolean,
 * never from CSS `:hover` or `:focus`.
 */

import type { TextStyle, ViewStyle } from 'react-native';
import { FOCUS_SHADOW_SM } from '#ui/components/organisms/player/lib/style';
import { colors, fonts } from '#ui/lib/tokens';

export const panelList: ViewStyle = { gap: 10 };

const ROW_BASE: ViewStyle = {
  width: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: 14,
  paddingHorizontal: 22,
  paddingVertical: 18,
};

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

export const panelHint: TextStyle = {
  marginTop: 12,
  marginHorizontal: 2,
  fontFamily: fonts.ui,
  fontSize: 15,
  fontWeight: '500',
  lineHeight: 24,
  color: 'rgba(244, 243, 240, 0.5)',
};

export const panelEmpty: TextStyle = {
  paddingHorizontal: 2,
  paddingVertical: 4,
  fontFamily: fonts.ui,
  fontSize: 15,
  color: 'rgba(244, 243, 240, 0.45)',
};

export const rowOn: ViewStyle = {
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  boxShadow: FOCUS_SHADOW_SM,
};
export const rowOff: ViewStyle = { backgroundColor: 'transparent' };

export const rowStyle = (base: ViewStyle, on: ViewStyle, focused: boolean): ViewStyle[] => [
  base,
  focused ? on : rowOff,
];

export const pill = {
  borderRadius: 9,
  paddingVertical: 9,
  backgroundColor: 'rgba(255, 255, 255, 0.06)',
} as const;

export const pillLabel = { fontFamily: fonts.ui, fontWeight: '700' as const, fontSize: 13 };
