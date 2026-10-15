import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is the one on screen. One hook for every shell: the platform
 * answers on tvOS, Android TV and the phones, and react-native-web answers from
 * the Page Visibility API on the browser televisions and the web client.
 *
 * `inactive` counts as in front: it is the app switcher and the pull-down shade
 * on iOS, a second of nothing rather than a departure.
 */
export function useForeground(): boolean {
  const [inFront, setInFront] = useState(() => AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setInFront(state !== 'background');
    });
    return () => sub?.remove();
  }, []);
  return inFront;
}
