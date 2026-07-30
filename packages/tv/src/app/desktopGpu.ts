import { getTauri } from '#tv/features/playback/player/engine';

/** Linux desktop shell only: no other shell has the WebKitGTK DMABUF knob. */
export function gpuToggleAvailable(): boolean {
  if (getTauri() == null) return false;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /Linux/i.test(ua) && !/Android/i.test(ua);
}

export async function getGpuRendering(): Promise<boolean> {
  try {
    return (await getTauri()?.core.invoke('webview_gpu_get')) === true;
  } catch {
    return false;
  }
}

/** Relaunches: the renderer is picked before the webview initialises. */
export async function setGpuRendering(enabled: boolean): Promise<void> {
  const tauri = getTauri();
  if (!tauri) return;
  try {
    await tauri.core.invoke('webview_gpu_set', { enabled });
    await tauri.core.invoke('app_relaunch');
  } catch {
    /* the next toggle retries */
  }
}
