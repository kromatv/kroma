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

interface PalmSystem {
  platformBack?(): void;
}

function palmSystem(): PalmSystem | undefined {
  return (globalThis as { PalmSystem?: PalmSystem }).PalmSystem;
}

/** Back on the first screen leaves the app wherever the shell hands the app a
 * way out: Tizen's application exit (Samsung's key policy), or webOS's platform
 * Back, which the app owes the TV because `disableBackHistoryAPI` routes Back to it. */
export function canExitOnBack(): boolean {
  return tizenApplication() != null || palmSystem()?.platformBack != null;
}

/** Leave the app from its first screen: Tizen closes the application, webOS asks
 * whether to exit (webOS 6 and later) or returns to the Home launcher. */
export function exitOnBack(): void {
  const tizen = tizenApplication();
  if (tizen) tizen.getCurrentApplication().exit();
  else palmSystem()?.platformBack?.();
}
