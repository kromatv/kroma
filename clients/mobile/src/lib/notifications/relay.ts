// Trading this phone's push token for a grant, and remembering the result.
//
// A KROMA server is self-hosted by anybody; this app is published by the KROMA
// team. Apple and Google only accept credentials issued to the account that
// publishes an app, so the server a reader signs into has nothing either service
// would accept — handing it the raw APNs/FCM token would be handing it something
// it cannot use.
//
// So the token never leaves the phone. It goes to the relay, which holds the
// app's real credentials, and comes back as a GRANT: an opaque capability to
// notify THIS device and nothing else. That is what gets registered with the
// server, and it is all the server ever sees.
//
// The grant is then STORED, for two reasons that are easy to miss:
//
//   - Unsubscribing names the endpoint to remove. Since what was registered is
//     the grant and not the token, `endpoint()` has to hand back that same
//     string — re-minting would produce a different blob and the server would
//     delete nothing.
//   - A grant expires. Only the app can mint a replacement (a server has no way
//     to refresh one it holds), so it refreshes on launch; see `refreshGrant`.
//
// See `packages/push-relay/worker/grant.ts` for the other half.

import { z } from 'zod';
import { loadPref, savePref } from '#mobile/lib/storage';

/** Where grants are minted. A constant, not a setting: pointing a phone's
 * notifications at an arbitrary host is a phishing route, not a feature. */
const RELAY_URL = 'https://push.kroma.tv';

/** Give up rather than hang the settings toggle on a slow network. */
const TIMEOUT_MS = 10_000;

const PREF_KEY = 'push.grant';

/**
 * Re-mint once a grant is within this of expiring.
 *
 * Generous because the refresh only gets a chance to run when the app is opened:
 * a reader who opens KROMA once a month must still cross the window comfortably
 * before the grant dies and their notifications go quiet.
 */
const REFRESH_BEFORE_MS = 30 * 24 * 60 * 60 * 1000;

const GrantResponse = z.object({
  grant: z.string().min(1),
  /** Epoch millis. */
  expiresAt: z.number(),
});

/** What is kept on the device. The token is stored alongside so a REPLACED
 * token — a reinstall, a restore onto another handset — is spotted and re-minted
 * rather than silently notifying whatever the old grant pointed at. */
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

/**
 * Exchange a raw device token for a relay grant.
 *
 * Throws on anything that is not a usable grant — the caller turns that into
 * "push could not be enabled" rather than registering something that will never
 * deliver.
 */
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
  /** The new grant, to register with the server. */
  grant: string;
  /** The one it replaces, still registered there. */
  previous: string;
  /** Adopt the new grant, once the server has accepted it. */
  commit(): Promise<void>;
}

/**
 * Replace a grant that is approaching its expiry, or `null` when nothing needed
 * doing.
 *
 * A server cannot do this: it holds a sealed blob and has no idea which device
 * is behind it, so an expiring grant would simply start failing. Only the app
 * holds the device token the relay needs, which is why this runs on launch.
 *
 * The new grant is deliberately NOT stored yet. Storing it here overwrote the
 * only copy of the old one, so a caller whose `subscribePush` then failed was
 * left holding a grant the server had never seen: turning push off would send
 * the server an endpoint it does not have, delete nothing, and leave a phone
 * the reader believes is silent still buzzing. The caller commits once the
 * server has actually taken it.
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
