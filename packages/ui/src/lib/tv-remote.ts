/// <reference path="types/react-native-tv.d.ts" />
// Reading react-native-tvos remote events the same way in both places that read
// them: focus-nav's Back/PlayPause bridge and the player's key router.

import { type HWEvent, Platform } from 'react-native';

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

const BACK_HANDLER_PLATFORMS: ReadonlySet<string> = new Set(['android', 'tizen']);

/**
 * Whether the remote's Back reaches JavaScript as `hardwareBackPress` on
 * `BackHandler`, as it does on Android and Tizen. tvOS reports it as the `menu`
 * remote event instead, and builds its `BackHandler` on top of that event.
 */
export function backThroughBackHandler(): boolean {
  return BACK_HANDLER_PLATFORMS.has(Platform.OS);
}
