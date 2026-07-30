/// <reference path="types/react-native-tv.d.ts" />
// Reading react-native-tvos remote events the same way in both places that read
// them: focus-nav's Back/PlayPause bridge and the player's key router.

import type { HWEvent } from 'react-native';
import { Platform, TVEventControl } from 'react-native';

/**
 * Whether this event is the trailing half of a press and should be ignored.
 *
 * Android TV reports a press as two events (`0` down, `1` up); tvOS reports one
 * and stamps it `1` anyway, so a bare `eventKeyAction === 1` filter drops every
 * key on Apple TV.
 */
export function isRemoteKeyUp(evt: HWEvent): boolean {
  return Platform.OS === 'android' && evt.eventKeyAction === 1;
}

// `enableTVMenuKey` / `disableTVMenuKey` is ONE global switch with two nesting
// claimants (`useFocusNav`, `usePlayerKeys`). Counted, so an inner claimant
// unmounting cannot leave the outer one without the key - Menu would then quit
// the app instead of closing the player.
let menuHolders = 0;

export function holdMenuKey(): void {
  menuHolders += 1;
  if (menuHolders === 1) TVEventControl?.enableTVMenuKey?.();
}

export function releaseMenuKey(): void {
  menuHolders = Math.max(0, menuHolders - 1);
  if (menuHolders === 0) TVEventControl?.disableTVMenuKey?.();
}
