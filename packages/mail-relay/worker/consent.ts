import { open, seal } from '@kromatv/relay-grant';
import { z } from 'zod';
import { Address, Locale, Origin, ServerName } from './schemas';

/** A consent request lives as long as the server's own verification link. */
export const PENDING_TTL_SECS = 7 * 24 * 60 * 60;

/** A grant is renewed on every successful send, so this is how long an unused one keeps. */
export const GRANT_TTL_SECS = 365 * 24 * 60 * 60;

const PENDING_SALT = 'kroma.mail.relay/pending';
const GRANT_SALT = 'kroma.mail.relay/grant';

/** What rides in a consent link: the mailbox, the server, its name, the
 * recipient's language, and the server's own verification token. */
export const Pending = z.strictObject({
  a: Address,
  o: Origin,
  n: ServerName,
  l: Locale,
  t: z.string().min(1),
  e: z.number(),
});
export type Pending = z.infer<typeof Pending>;

/** What a mailbox granted: this server may write to this address. */
export const Grant = z.strictObject({
  a: Address,
  o: Origin,
  e: z.number(),
});
export type Grant = z.infer<typeof Grant>;

export function sealPending(secret: string, pending: Pending): Promise<string> {
  return seal({ secret, salt: PENDING_SALT }, pending);
}

export function openPending(
  secret: string,
  blob: string,
  nowSecs: number,
): Promise<Pending | null> {
  return open({ secret, salt: PENDING_SALT }, blob, nowSecs, Pending);
}

export function sealGrant(secret: string, grant: Grant): Promise<string> {
  return seal({ secret, salt: GRANT_SALT }, grant);
}

export function openGrant(secret: string, blob: string, nowSecs: number): Promise<Grant | null> {
  return open({ secret, salt: GRANT_SALT }, blob, nowSecs, Grant);
}
