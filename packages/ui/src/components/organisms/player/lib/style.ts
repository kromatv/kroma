// Shared styles for the unified player chrome, replacing the Tailwind class
// constants it used to carry (./tw.ts). Same values, expressed once as React
// Native styles so the one chrome renders on Apple TV and Android TV as well as
// in every browser target.
//
// Focus here is STATE-driven, never CSS :hover / :focus: a pointer moves focus
// exactly like the D-pad does, so the chrome always has exactly one focused
// control and both input models light the same thing.

import type { TextStyle, ViewStyle } from 'react-native';
import { colors, fonts, glow, radius, ring } from '#ui/lib/tokens';

/** The unified amber focus treatment for any focused control: the ring plus the
 * spring pop. `glow.accent` is the amber bloom the player uses (the 10-foot
 * screens override it to a dark lift; inside the player the video behind is
 * already dark, so the bloom is what reads). */
export const FOCUS_SHADOW = `${ring.focus}, ${glow.accent}`;
/** Thinner ring for dense rows (settings entries, cards). */
export const FOCUS_SHADOW_SM = `${ring.focusSm}, ${glow.accent}`;
export const FOCUS_SCALE = 1.07;

/** The seek bar's anatomy (§1), shared with the mobile touch scrub bar so both
 * draw the identical track: the resting and buffered fills, the amber played
 * gradient's stops, and the playhead's amber halo. */
export const SEEK_BAR = {
  track: 'rgba(255, 255, 255, 0.2)',
  buffered: 'rgba(255, 255, 255, 0.28)',
  played: [colors.accent, colors.accentBright],
  playheadHalo: 'rgba(242, 180, 66, 0.5)',
} as const;

/** Circular transport / cluster control base. */
export const CTRL: ViewStyle = {
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: radius.pill,
};
export const CTRL_ON = 'rgba(255, 255, 255, 0.22)';
export const CTRL_OFF = 'rgba(255, 255, 255, 0.12)';

/** A translucent capsule (the volume pill container). */
export const PILL_WRAP: ViewStyle = {
  flexShrink: 0,
  flexDirection: 'row',
  alignItems: 'center',
  borderRadius: radius.pill,
  overflow: 'hidden',
};

/** Section eyebrow (uppercase, tracked, dim). */
export const EYEBROW: TextStyle = {
  fontFamily: fonts.ui,
  fontSize: 12,
  fontWeight: '700',
  letterSpacing: 1.68,
  textTransform: 'uppercase',
  color: 'rgba(244, 243, 240, 0.45)',
};

/** A right-side sliding panel surface (settings / AV drawer). */
export const PANEL: ViewStyle = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  zIndex: 42,
  backgroundColor: 'rgba(16, 16, 20, 0.94)',
};

/** The scrim behind a panel or sheet: dark enough to read against, sheer enough
 * that the picture stays visible underneath. */
export const SCRIM = 'rgba(0, 0, 0, 0.45)';

/** Panel / sheet body text. */
export const BODY: TextStyle = { fontFamily: fonts.ui, fontSize: 15, color: colors.text };
export const META: TextStyle = {
  fontFamily: fonts.ui,
  fontSize: 13,
  color: 'rgba(244, 243, 240, 0.55)',
};
