import { useCallback, useRef } from 'react';
import { Platform } from 'react-native';

import { push as loadPush } from './native';

async function askNotificationPermission(): Promise<void> {
  try {
    const Notifications = loadPush();
    if (!Notifications) return;
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted' || !canAskAgain) return;
    await Notifications.requestPermissionsAsync();
  } catch (e) {
    console.log(`[downloads] notification prompt failed: ${String(e)}`);
  }
}

/** Runs `then` once Android has its answer about notifications, which a transfer
 * shows its progress through. Asks at most once per mount, and never on a phone
 * that has granted or can no longer be asked; a refusal still runs `then`. */
export function useDownloadPrompt(): (then: () => void) => void {
  const asked = useRef<Promise<void> | null>(null);
  return useCallback((then) => {
    if (Platform.OS !== 'android') {
      then();
      return;
    }
    asked.current ??= askNotificationPermission();
    void asked.current.then(then);
  }, []);
}
