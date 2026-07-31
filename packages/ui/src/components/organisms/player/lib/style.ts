// Shared React Native styles for the unified player chrome.
//
// Focus is state-driven, never CSS :hover / :focus: a pointer moves focus exactly
// like the D-pad does, so the chrome always has exactly one focused control.

import { type ColorValue, styles, themed, withAlpha } from '#ui/core';

export const FOCUS_SCALE = 1.07;

export interface SeekBarPaint {
  track: ColorValue;
  buffered: ColorValue;
  played: readonly [string, string];
  playheadHalo: string;
}

/** The seek bar's paints, shared with the mobile touch scrub bar so both draw
 *  the identical track. A function, so the accent follows the theme. */
export const seekBar = themed(
  ({ colors }): SeekBarPaint => ({
    track: 'rgba(255, 255, 255, 0.2)',
    buffered: 'rgba(255, 255, 255, 0.28)',
    played: [colors.accent, colors.accentBright],
    playheadHalo: withAlpha(colors.accentWash, 0.5),
  }),
);

export const SCRIM = 'rgba(0, 0, 0, 0.45)';

export const playerStyle = styles({
  eyebrow: {
    font: 'ui',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.68,
    textTransform: 'uppercase',
    color: 'textDim',
  },
  panel: { absolute: true, top: 0, bottom: 0, right: 0, z: 42, bg: 'rgba(16, 16, 20, 0.94)' },
  body: { font: 'ui', fontSize: 15, color: 'text' },
  meta: { font: 'ui', fontSize: 13, color: 'text/55' },
});
