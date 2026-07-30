// A KROMA server is self-hosted and holds no Apple/Google push credentials, so
// the raw device token never leaves the phone: it is exchanged with the relay
// for an opaque GRANT (a capability to notify this device only), and the grant
// is all the server ever registers or sees.

import { z } from 'zod';
import { loadPref, savePref } from '#mobile/lib/storage';

// Hard-coded, not a setting: pointing push at an arbitrary host is phishing.
const RELAY_URL = 'https://push.kroma.tv';

const TIMEOUT_MS = 10_000;

const PREF_KEY = 'push.grant';

// Generous: refresh only runs on app open, and a reader might open KROMA once a month.
const REFRESH_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;

const GrantResponse = z.object({
  grant: z.string().min(1),
  expiresAt: z.number(),
});

// The token is stored alongside the grant so a replaced token (reinstall, new
// handset) is detected and re-minted rather than silently notifying the wrong device.
const StoredGrant = z.object({
  transport: z.enum(['apns', 'fcm']),
  token: z.string().min(1),
  grant: z.string().min(1),
  expiresAt: z.number(),
});
type StoredGrant = z.infer<typeof StoredGrant>;

async function read(): Promise<StoredGrant | null> {
  const raw = await loadPref(PREF_KEY);
  if (!raw) return null;
  try {
    const parsed = StoredGrant.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Throws on anything that is not a usable grant, so the caller reports "push
// could not be enabled" rather than registering something that will never
// deliver.
async function mint(transport: 'apns' | 'fcm', token: string): Promise<StoredGrant> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${RELAY_URL}/v1/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transport, token }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`relay returned ${response.status}`);
    // Parsed, not trusted: this is a network boundary like any other.
    const { grant, expiresAt } = GrantResponse.parse(await response.json());
    return { transport, token, grant, expiresAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The grant to register for this device token, minting one if what is stored is
 * missing, stale, or belongs to a different token.
 */
export async function grantFor(transport: 'apns' | 'fcm', token: string): Promise<string> {
  const stored = await read();
  const usable =
    stored?.token === token &&
    stored.transport === transport &&
    stored.expiresAt - Date.now() > REFRESH_BEFORE_MS;
  if (stored && usable) return stored.grant;

  const minted = await mint(transport, token);
  await savePref(PREF_KEY, JSON.stringify(minted));
  return minted.grant;
}

/** The grant currently registered with a server, or `null`. What `endpoint()`
 * must return, so unsubscribing names the row the server actually stored. */
export async function storedGrant(): Promise<string | null> {
  return (await read())?.grant ?? null;
}

/** Drop the remembered grant. The relay keeps no record of it, so forgetting it
 * here is the whole of the device side. */
export async function forgetGrant(): Promise<void> {
  await savePref(PREF_KEY, null);
}

/** A replacement grant, minted but not yet this device's. */
export interface GrantRefresh {
  grant: string;
  previous: string;
  // Call only once the server has actually accepted the new grant.
  commit(): Promise<void>;
}

/**
 * Replace a grant nearing its expiry, or `null` when nothing needed doing.
 *
 * The new grant is deliberately not stored until the caller commits: storing
 * it eagerly would overwrite the only copy of the old one before the server
 * has accepted the replacement, leaving a phone that still buzzes with no way
 * to unregister it.
 */
export async function refreshGrant(): Promise<GrantRefresh | null> {
  const stored = await read();
  if (!stored) return null;
  if (stored.expiresAt - Date.now() > REFRESH_BEFORE_MS) return null;
  const minted = await mint(stored.transport, stored.token);
  return {
    grant: minted.grant,
    previous: stored.grant,
    commit: () => savePref(PREF_KEY, JSON.stringify(minted)),
  };
}
