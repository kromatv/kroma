import * as ScreenOrientation from 'expo-screen-orientation';
import { Platform } from 'react-native';
import { isTablet } from '#mobile/lib/layout';

type StackOrientation = 'default' | 'portrait' | 'landscape';

export const UPRIGHT: StackOrientation = isTablet ? 'default' : 'portrait';
export const PLAYER_ORIENTATION: StackOrientation = UPRIGHT;

export function playerOrientation(fullscreen: boolean): StackOrientation {
  if (isTablet) return 'default';
  return fullscreen ? 'landscape' : 'portrait';
}

/** Reapply the iPhone scene's portrait lock after a player modal dismisses. */
export function lockUpright(): void {
  if (Platform.OS !== 'ios' || isTablet) return;
  void lockPlayerOrientation(false);
}

/** Request phone scene rotation independently of its physical posture. */
export async function lockPlayerOrientation(fullscreen: boolean): Promise<void> {
  if (isTablet) return;
  const lock = fullscreen
    ? ScreenOrientation.OrientationLock.LANDSCAPE
    : ScreenOrientation.OrientationLock.PORTRAIT_UP;
  await ScreenOrientation.lockAsync(lock).catch(() => undefined);
}

export async function allowPlayerRotation(): Promise<void> {
  await ScreenOrientation.unlockAsync().catch(() => undefined);
}
