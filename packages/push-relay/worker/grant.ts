/** Grants: the only thing a KROMA server is ever given about a device.
 *
 * The problem this solves is specific to how KROMA is deployed. The app is
 * published by one team, so the Apple and Google credentials belong to that
 * team; the SERVER is self-hosted by anybody, and its source is public. There
 * is therefore no secret that can live on a server — anything shipped there is
 * readable by everyone, and a shared relay password would be world-readable the
 * day it was committed.
 *
 * So a server is not authenticated at all. Instead it is handed a CAPABILITY:
 * an opaque blob, minted by the relay, that names exactly one device and can do
 * exactly one thing — push to that device. It is issued to the app (which holds
 * the real device token), and the app passes it to whichever server the reader
 * signed into.
 *
 * What that buys, stated as the attack it prevents: to notify everyone you would
 * need everyone's grant. Grants cannot be forged without `GRANT_SECRET`, which
 * never leaves the relay, and they cannot be harvested in bulk because they are
 * only ever minted to a device that already holds its own push token. Breaking
 * into one self-hosted server yields grants for that server's own users — people
 * who already trusted it with their notifications and whom it could already
 * reach. The blast radius is the same as before the relay existed.
 *
 * The blob is SEALED, not merely signed: AES-256-GCM, so a grant is unreadable
 * as well as unforgeable. A server never learns the raw APNs/FCM token even
 * though it stores the grant, which means a leaked server database is not a
 * pile of device tokens.
 */

import { z } from 'zod';
import { b64url, fromB64url } from './jwt';
import { Transport } from './schemas';

export type { Transport };

/**
 * What a sealed grant contains.
 *
 * A schema rather than an interface because the plaintext is only trusted once
 * GCM has vouched for it — and even then it may be a grant from an older format
 * version. Parsing is what makes the fields below safe to read.
 */
export const GrantPayload = z.object({
  /** Transport. */
  t: Transport,
  /** The raw device token. Never leaves the relay in readable form. */
  d: z.string().min(1),
  /** Expiry, epoch seconds. */
  e: z.number(),
});
export type GrantPayload = z.infer<typeof GrantPayload>;

/**
 * How long a grant stays valid.
 *
 * Long, because only the APP can mint a replacement and a server has no way to
 * refresh one it holds — a short life would mean push silently dying for anyone
 * who had not opened the app recently. The app refreshes on launch, so in
 * practice a grant is replaced long before this. Expiry still matters: it bounds
 * how long a grant recovered from an old backup stays useful.
 */
export const GRANT_TTL_SECS = 180 * 24 * 60 * 60;

/** Versioned so the format can change without every device re-registering. */
const PREFIX = 'v1';
const IV_BYTES = 12;

const utf8 = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The derived key, kept for the isolate's life.
 *
 * Both hot routes need it — every `/v1/grant` seals and every `/v1/push` opens —
 * and the derivation is two WebCrypto calls that produce the same key every time
 * for a given secret. Safe to hold: it is non-extractable, so this is a handle
 * rather than key material, the same argument `apns.ts` makes for its imported
 * `.p8`. Keyed on the secret so a rotated `GRANT_SECRET` re-derives rather than
 * serving a stale key.
 */
let derived: { secret: string; key: Promise<CryptoKey> } | null = null;

/**
 * The AES key, derived from the configured secret rather than used directly, so
 * that `GRANT_SECRET` can be any string an operator pastes in without its length
 * or entropy layout mattering to AES.
 */
function sealingKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('GRANT_SECRET is not configured');
  if (derived?.secret === secret) return derived.key;
  const key = (async () => {
    const material = await crypto.subtle.importKey('raw', utf8.encode(secret), 'HKDF', false, [
      'deriveKey',
    ]);
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: utf8.encode('kroma.push.relay'),
        info: utf8.encode(PREFIX),
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  })();
  // Cache the promise, not the resolved key: two concurrent requests on a cold
  // isolate then share one derivation instead of racing to do it twice.
  derived = { secret, key };
  // A failed derivation must not be remembered as this secret's answer.
  key.catch(() => {
    if (derived?.key === key) derived = null;
  });
  return key;
}

/** Mint a grant for one device. */
export async function seal(secret: string, payload: GrantPayload): Promise<string> {
  const key = await sealingKey(secret);
  // Never `Math.random()`: a predictable IV in GCM is a key-recovery bug, not a
  // style preference.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    utf8.encode(JSON.stringify(payload)),
  );
  const joined = new Uint8Array(IV_BYTES + sealed.byteLength);
  joined.set(iv, 0);
  joined.set(new Uint8Array(sealed), IV_BYTES);
  return `${PREFIX}.${b64url(joined)}`;
}

/**
 * Open a grant, or `null` when it is not one.
 *
 * Every failure — wrong prefix, truncated blob, forged tag, expired payload —
 * returns `null` rather than throwing or distinguishing itself, because the
 * caller answers all of them with the same 401. GCM's tag check does the real
 * work: a single flipped bit fails to decrypt at all.
 */
export async function open(
  secret: string,
  grant: string,
  nowSecs: number,
): Promise<GrantPayload | null> {
  const [prefix, blob] = grant.split('.');
  if (prefix !== PREFIX || !blob) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromB64url(blob);
  } catch {
    return null;
  }
  if (bytes.length <= IV_BYTES) return null;
  try {
    const key = await sealingKey(secret);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.subarray(0, IV_BYTES) },
      key,
      bytes.subarray(IV_BYTES),
    );
    const payload = GrantPayload.safeParse(JSON.parse(decoder.decode(plain)));
    if (!payload.success || payload.data.e <= nowSecs) return null;
    return payload.data;
  } catch {
    return null;
  }
}

/**
 * A stable rate-limit key for a device, without holding its token.
 *
 * Derived from the token rather than from the grant so that re-minting cannot
 * buy a fresh budget: a device that asks for a new grant every second is still
 * the same device, and still capped.
 */
export async function deviceKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(token));
  return b64url(digest).slice(0, 22);
}
