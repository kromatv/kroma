import { b64url } from '@kromatv/relay-grant';

/** The KV binding's shape, declared locally like the rate limiter's. */
export interface Counters {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

const DAY_SECS = 24 * 60 * 60;

const utf8 = new TextEncoder();

/**
 * Take one unit from `key`'s budget for the current day, or say it is spent.
 * Best-effort: KV is eventually consistent, so a burst may overshoot by a few.
 * The per-minute rate limiters are what stop a burst; this is what stops a slow drip.
 */
export async function takeDaily(
  kv: Counters,
  key: string,
  limit: number,
  nowSecs: number,
): Promise<boolean> {
  const bucket = `${key}:${Math.floor(nowSecs / DAY_SECS)}`;
  const used = Number((await kv.get(bucket)) ?? '0');
  if (used >= limit) return false;
  await kv.put(bucket, String(used + 1), { expirationTtl: 2 * DAY_SECS });
  return true;
}

/**
 * A counter key for a mailbox that cannot be turned back into it: an HMAC
 * under a secret only the relay holds, so a dump of the counters names nobody.
 */
export async function addressKey(secret: string, address: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    utf8.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, utf8.encode(address.trim().toLowerCase()));
  return b64url(mac).slice(0, 22);
}
