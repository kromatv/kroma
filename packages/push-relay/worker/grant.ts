// Grants: the only thing a KROMA server is ever given about a device. A self-hosted server
// holds no secret - its source and deployment are public - so it is never authenticated.
// Instead it holds a CAPABILITY: an opaque, sealed blob minted by the relay that can push to
// exactly one device. Sealed (AES-256-GCM), not merely signed, so a leaked server database
// yields no readable device tokens either. The sealing itself is `@kromatv/relay-grant`, shared
// with the mail relay; the salt below is what keeps the two relays' grants apart.

import { open as openSealed, seal as sealPayload } from '@kromatv/relay-grant';
import { z } from 'zod';
import { Transport } from './schemas';

export type { Transport };

/**
 * What a sealed grant contains.
 *
 * A schema rather than an interface because the plaintext is only trusted once
 * GCM has vouched for it, and even then it may be a grant from an older format
 * version. Parsing is what makes the fields below safe to read.
 */
export const GrantPayload = z.object({
  t: Transport,
  // Never leaves the relay in readable form.
  d: z.string().min(1),
  e: z.number(),
});
export type GrantPayload = z.infer<typeof GrantPayload>;

// Long, because only the APP can mint a replacement and a server has no way
// to refresh one it holds - a short life would mean push silently dying for
// anyone who hadn't opened the app recently. The app refreshes on launch, so
// in practice a grant is replaced long before this; expiry still bounds how
// long a grant recovered from an old backup stays useful.
export const GRANT_TTL_SECS = 180 * 24 * 60 * 60;

const SALT = 'kroma.push.relay';

/** Mint a grant for one device. */
export function seal(secret: string, payload: GrantPayload): Promise<string> {
  return sealPayload({ secret, salt: SALT }, payload);
}

/** Open a grant, or `null` when it is not one. */
export function open(secret: string, grant: string, nowSecs: number): Promise<GrantPayload | null> {
  return openSealed({ secret, salt: SALT }, grant, nowSecs, GrantPayload);
}

/**
 * A stable rate-limit key for a device, without holding its token.
 *
 * Derived from the token rather than from the grant so that re-minting cannot
 * buy a fresh budget: a device that asks for a new grant every second is still
 * the same device, and still capped.
 */
export { subjectKey as deviceKey } from '@kromatv/relay-grant';
