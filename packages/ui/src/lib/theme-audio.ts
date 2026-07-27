// Everything the theme-audio design specifies, shared by both halves.
//
// The browser plays a theme with an <audio> element and the native targets with
// an expo-video player, but the DESIGN is one: the same quiet level, the same
// fade in and out, the same mute preference on the same key. Keeping those here
// is what stops a television and a browser from disagreeing about how loud a
// series page is.

import { deviceStorage } from '@kroma/core';

/** Persisted per device, shared by every detail page. */
const MUTE_KEY = 'kroma.theme.muted';

/** Quiet background level: present, never competing with the user. */
export const TARGET_VOLUME = 0.35;
export const FADE_IN_MS = 900;
export const FADE_OUT_MS = 600;

/** The stored mute preference. Safe everywhere: a device with no store reads
 * as unmuted, which is the design's default. */
export function readThemeMuted(): boolean {
  try {
    return deviceStorage()?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeThemeMuted(muted: boolean): void {
  try {
    deviceStorage()?.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // A device that cannot persist still honours the choice for this session.
  }
}
