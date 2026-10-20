// Desktop auto-update: installs a newer signed build in the background and
// relaunches. Silent by design (a 10-foot app has no update dialog), so failures
// are logged, not shown. The feed is the update channel of the server this app
// is signed into, so Admin -> General is the one switch for the household; a
// server that cannot be reached, or an app signed into none, follows stable.
import { createAccountStorage, normalizeServerUrl } from '@kromatv/client/accounts';
import { Health } from '@kromatv/client/media';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_HEALTH_BYTES = 64 * 1024;

async function serverChannel(): Promise<string> {
  const url = createAccountStorage().loadSession()?.serverUrl;
  if (!url) return 'Stable';
  try {
    const res = await fetch(`${normalizeServerUrl(url)}/api/health`);
    const body = await res.text();
    if (!res.ok || body.length > MAX_HEALTH_BYTES) return 'Stable';
    return Health.parse(JSON.parse(body)).updateChannel ?? 'Stable';
  } catch {
    return 'Stable';
  }
}

async function runOnce(): Promise<void> {
  try {
    const channel = await serverChannel();
    const version = await invoke<string | null>('update_install', { channel });
    if (!version) return;
    console.log(`[updater] installed ${version} from ${channel}, relaunching`);
    await relaunch();
  } catch (err) {
    // Offline, no release yet, or not running inside Tauri (browser dev): ignore.
    console.warn('[updater] check failed:', err);
  }
}

/** Checks immediately, then on a fixed interval. */
export function startUpdater(): void {
  void runOnce();
  setInterval(() => void runOnce(), CHECK_INTERVAL_MS);
}
