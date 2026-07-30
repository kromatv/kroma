// Desktop auto-update: installs a newer signed build in the background and
// relaunches. Silent by design (a 10-foot app has no update dialog), so failures
// are logged, not shown. Updates are verified against the pubkey pinned in
// tauri.conf.json; on macOS the updater-installed bundle is NOT quarantined, so it
// opens with no Gatekeeper prompt even though the first download is unsigned.
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runOnce(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    console.log(`[updater] update available: ${update.version}, installing…`);
    await update.downloadAndInstall();
    console.log('[updater] installed, relaunching');
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
