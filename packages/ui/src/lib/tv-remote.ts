/// <reference path="types/react-native-tv.d.ts" />
// Reading react-native-tvos remote events the same way in both places that read
// them: the focus engine's Back/PlayPause bridge (focus-nav) and the player's key
// router (usePlayerKeys).

import type { HWEvent } from 'react-native';
import { Platform, TVEventControl } from 'react-native';

/**
 * Whether this event is the trailing half of a press and should be ignored.
 *
 * The two platforms stamp `eventKeyAction` differently, and the difference is
 * not cosmetic:
 *
 *  - **Android TV** reports a key press as TWO events, the KeyEvent actions
 *    `0` (down) and `1` (up). Acting on both fires everything twice.
 *  - **tvOS** reports ONE event per press - and stamps it `1` anyway.
 *
 * So the obvious `eventKeyAction === 1` filter is right on Android and silently
 * fatal on Apple TV: it drops every arrow, every Select, every Menu. The whole
 * remote went dead there - Back could not leave a screen and the player's
 * transport never saw a key - while the app still LOOKED alive, because
 * directional movement on the other screens is the OS focus engine moving focus
 * on its own, with no JavaScript involved at all.
 */
export function isRemoteKeyUp(evt: HWEvent): boolean {
  return Platform.OS === 'android' && evt.eventKeyAction === 1;
}

/**
 * How many mounted things want the Menu button reported to the app.
 *
 * `enableTVMenuKey` / `disableTVMenuKey` are ONE global switch, and the app has
 * two independent claimants that nest: every screen through `useFocusNav`, and
 * the player through `usePlayerKeys`. Toggling the switch per claimant means the
 * inner one turns the key off on its way out while the outer one still needs it,
 * and the next Menu press leaves KROMA instead of closing the player. Measured
 * on an Apple TV: closing the player's settings panel and pressing Back once
 * more quit the app, mid-film.
 *
 * Counted, so the key goes back to the platform only when the last claimant is
 * gone - which is right, because at the top of the stack Menu SHOULD background
 * the app.
 */
let menuHolders = 0;

export function holdMenuKey(): void {
  menuHolders += 1;
  if (menuHolders === 1) TVEventControl?.enableTVMenuKey?.();
}

export function releaseMenuKey(): void {
  menuHolders = Math.max(0, menuHolders - 1);
  if (menuHolders === 0) TVEventControl?.disableTVMenuKey?.();
}
