import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';
import { isTablet } from '#mobile/lib/layout';

type StackOrientation = 'default' | 'portrait' | 'landscape' | undefined;

/** What a stack tells react-native-screens about a phone that stays upright.
 *  Android honours it per screen; on iOS the window's root controller belongs
 *  to expo-screen-orientation, which answers UIKit's default whenever a
 *  screen sets an orientation, so the upright lock is registered there
 *  instead (`lockUpright`) and the stack says nothing. */
export const UPRIGHT: StackOrientation = upright();

function upright(): StackOrientation {
  if (Platform.OS === 'ios') return undefined;
  return isTablet ? 'default' : 'portrait';
}

/** The player's screen: landscape on a phone, free on a tablet. A presented
 *  screen answers for itself on iOS, so this one holds on both platforms. */
export const PLAYER_ORIENTATION: StackOrientation = isTablet ? 'default' : 'landscape';

/** Register the upright lock once at startup: a phone rotates only inside
 *  the player, and comes back upright when the player closes. */
export function lockUpright(): void {
  if (Platform.OS !== 'ios' || isTablet) return;
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
}
