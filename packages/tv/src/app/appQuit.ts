import { getTauri } from '#tv/features/playback/player/engine';

/** Only the desktop (Tauri) shell runs fullscreen without window chrome, so
 * only it needs the app to offer its own way out. */
export function canQuitApp(): boolean {
  return getTauri() != null;
}

/** Ask the hosting shell to close the app: the desktop `app_quit` command, which
 * exits through the event loop and so also stops the mpv sidecar. */
export function quitApp(): void {
  void getTauri()?.core.invoke('app_quit');
}
