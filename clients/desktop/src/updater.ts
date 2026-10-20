// Desktop auto-update: installs a newer signed build in the background and
// relaunches. Silent by design (a 10-foot app has no update dialog), so failures
// are logged, not shown. The feed is the update channel of the server this app
// is signed into, or last used, so Admin -> General is the one switch for the
// household; a server that cannot be reached, or none at all, means stable.
import { createAccountStorage, normalizeServerUrl } from '@kromatv/client/accounts';
import { invoke } from '@tauri-apps/api/core';
import { relaunch } from '@tauri-apps/plugin-process';
import { z } from 'zod';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 10_000;
const MAX_HEALTH_BYTES = 64 * 1024;

const ChannelOnly = z.object({ updateChannel: z.string().optional() });

function serverUrl(): string | null {
  const accounts = createAccountStorage();
  return accounts.loadSession()?.serverUrl ?? accounts.loadServers()[0]?.url ?? null;
}

async function serverChannel(): Promise<string> {
  const url = serverUrl();
  if (!url) return 'Stable';
  try {
    const res = await fetch(`${normalizeServerUrl(url)}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || declared > MAX_HEALTH_BYTES) return 'Stable';
    const body = await res.text();
    if (body.length > MAX_HEALTH_BYTES) return 'Stable';
    return ChannelOnly.safeParse(JSON.parse(body)).data?.updateChannel ?? 'Stable';
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
