// Shared React Native styles for the unified player chrome.
//
// Focus is state-driven, never CSS :hover / :focus: a pointer moves focus exactly
// like the D-pad does, so the chrome always has exactly one focused control.

import type { TextStyle, ViewStyle } from 'react-native';
import { colors, fonts, glow, radius, ring } from '#ui/lib/tokens';

export const FOCUS_SHADOW = `${ring.focus}, ${glow.accent}`;
export const FOCUS_SHADOW_SM = `${ring.focusSm}, ${glow.accent}`;
export const FOCUS_SCALE = 1.07;

// Shared with the mobile touch scrub bar so both draw the identical track.
export const SEEK_BAR = {
  track: 'rgba(255, 255, 255, 0.2)',
  buffered: 'rgba(255, 255, 255, 0.28)',
  played: [colors.accent, colors.accentBright],
  playheadHalo: 'rgba(242, 180, 66, 0.5)',
} as const;

export const CTRL: ViewStyle = {
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.pill,
};
export const CTRL_ON = 'rgba(255, 255, 255, 0.22)';
export const CTRL_OFF = 'rgba(255, 255, 255, 0.12)';

export const PILL_WRAP: ViewStyle = {
  flexShrink: 0,
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: radius.pill,
  overflow: 'hidden',
};

export const EYEBROW: TextStyle = {
  fontFamily: fonts.ui,
  fontSize: 12,
  fontWeight: '700',
  letterSpacing: 1.68,
  textTransform: 'uppercase',
  color: 'rgba(244, 243, 240, 0.45)',
};

export const PANEL: ViewStyle = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  zIndex: 42,
  backgroundColor: 'rgba(16, 16, 20, 0.94)',
};

export const SCRIM = 'rgba(0, 0, 0, 0.45)';

export const BODY: TextStyle = { fontFamily: fonts.ui, fontSize: 15, color: colors.text };
export const META: TextStyle = {
  fontFamily: fonts.ui,
  fontSize: 13,
  color: 'rgba(244, 243, 240, 0.55)',
};
