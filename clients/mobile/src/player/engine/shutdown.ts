import type { VideoPlayer } from 'expo-video';
import { type EngineCore, nextLoadId, patchCore } from './types';

export function stopNativePlayer(player: VideoPlayer): void {
  try {
    player.muted = true;
    player.staysActiveInBackground = false;
    player.showNowPlayingNotification = false;
    player.pause();
  } catch {
    // Expo may release the native player before React's final cleanup.
  }
  void Promise.resolve()
    .then(() => player.replaceAsync(null))
    .catch(() => undefined);
}

export function shutdownEngine(core: EngineCore, player: VideoPlayer): void {
  if (!core.active) return;
  nextLoadId(core);
  patchCore(core, {
    active: false,
    terminal: true,
    resumeOnLoad: false,
    pendingSeek: null,
    started: false,
  });
  stopNativePlayer(player);
}
