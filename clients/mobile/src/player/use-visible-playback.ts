import type { VideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const PIP_TRANSITION_MS = 700;

function pause(player: VideoPlayer) {
  try {
    player.pause();
  } catch {
    // Expo can release the native player before React's cleanup.
  }
}

export function useVisiblePlayback(player: VideoPlayer, inPip: boolean): void {
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const changed = (state: AppStateStatus) => {
      clearTimeout(timeout);
      if (state !== 'background' || inPip) return;
      // Automatic PiP enters during the same app-background transition.
      timeout = setTimeout(() => pause(player), PIP_TRANSITION_MS);
    };
    const subscription = AppState.addEventListener('change', changed);
    changed(AppState.currentState);
    return () => {
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [player, inPip]);

  useEffect(() => () => pause(player), [player]);
}
