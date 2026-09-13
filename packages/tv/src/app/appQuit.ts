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

interface TizenApplication {
  getCurrentApplication(): { exit(): void };
}

function tizenApplication(): TizenApplication | undefined {
  return (globalThis as { tizen?: { application?: TizenApplication } }).tizen?.application;
}

/** Samsung's key policy: Back on the first screen leaves the app, and Tizen is
 * the one shell that hands the app an exit of its own. */
export function canExitOnBack(): boolean {
  return tizenApplication() != null;
}

/** Leave the app from its first screen through Tizen's application exit. */
export function exitOnBack(): void {
  tizenApplication()?.getCurrentApplication().exit();
}
