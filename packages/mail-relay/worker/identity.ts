import { b64url, fromB64url, open, seal } from '@kromatv/relay-grant';
import { z } from 'zod';
import { Origin, PublicKey, type SignedRequest } from './schemas';

/** An instance is re-registered by the server long before this; expiry only
 * bounds how long a blob out of an old backup keeps working. */
export const INSTANCE_TTL_SECS = 365 * 24 * 60 * 60;

const INSTANCE_SALT = 'kroma.mail.relay/instance';

/** What the relay knows about a server: its origin and the key that speaks for it. */
export const Instance = z.strictObject({
  o: Origin,
  k: PublicKey,
  e: z.number(),
});
export type Instance = z.infer<typeof Instance>;

export function sealInstance(secret: string, instance: Instance): Promise<string> {
  return seal({ secret, salt: INSTANCE_SALT }, instance);
}

export function openInstance(
  secret: string,
  blob: string,
  nowSecs: number,
): Promise<Instance | null> {
  return open({ secret, salt: INSTANCE_SALT }, blob, nowSecs, Instance);
}

const utf8 = new TextEncoder();

/** Import an uncompressed P-256 point, or `null` when it is not one. */
export async function importPublicKey(raw: string): Promise<CryptoKey | null> {
  try {
    return await crypto.subtle.importKey(
      'raw',
      fromB64url(raw),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    return null;
  }
}

/** Whether `signature` (raw `r || s`, base64url) is `key`'s ECDSA-SHA-256 over `text`. */
export async function verify(key: CryptoKey, text: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromB64url(signature),
      utf8.encode(text),
    );
  } catch {
    return false;
  }
}

/** A fresh challenge nonce. */
export function nonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Who signed a request and what they said: the instance the blob names, and
 * the payload parsed only once the instance's key has vouched for its bytes.
 * `null` for a blob that is not ours, a key that will not import, or a
 * signature that does not hold; the caller answers all three alike.
 */
export async function openSigned(
  secret: string,
  request: SignedRequest,
  nowSecs: number,
): Promise<{ instance: Instance; payload: unknown } | null> {
  const instance = await openInstance(secret, request.instance, nowSecs);
  if (!instance) return null;
  const key = await importPublicKey(instance.k);
  if (!key) return null;
  if (!(await verify(key, request.payload, request.signature))) return null;
  try {
    return { instance, payload: JSON.parse(request.payload) };
  } catch {
    return null;
  }
}
