import { open, seal } from '@kromatv/relay-grant';
import { z } from 'zod';
import { budgetKey, type Counters } from './limits';
import { Address, Origin } from './schemas';

/** An activation link lives as long as the server's own verification link. */
export const PENDING_TTL_SECS = 7 * 24 * 60 * 60;

/** How long a server's activation keeps without a message going through it. */
export const ACTIVE_TTL_SECS = 365 * 24 * 60 * 60;

const BLOCK_TTL_SECS = 10 * 365 * 24 * 60 * 60;

const PENDING_SALT = 'kroma.mail.relay/pending';
const BLOCK_SALT = 'kroma.mail.relay/block';

/** What rides in an activation link: the owner's mailbox, the server, the
 * address the server called from, and the server's own verification token,
 * so the click comes back as a verification of that mailbox too. */
export const Pending = z.strictObject({
  a: Address,
  o: Origin,
  t: z.string().min(1),
  i: z.string().max(45),
  e: z.number(),
});
export type Pending = z.infer<typeof Pending>;

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

/** The link an activation blob is clicked at. */
export function activationUrl(publicUrl: string, blob: string): string {
  return `${publicUrl}/confirm/${blob}`;
}

/** The blob inside an activation link, or `null` when the link is not one of ours. */
export function activationBlob(publicUrl: string, url: string): string | null {
  const prefix = `${publicUrl}/confirm/`;
  if (!url.startsWith(prefix)) return null;
  const blob = url.slice(prefix.length);
  return /^[A-Za-z0-9._-]+$/.test(blob) ? blob : null;
}

/** What rides in the opt-out link every delivered message carries. */
export const Block = z.strictObject({ a: Address, o: Origin, e: z.number() });
export type Block = z.infer<typeof Block>;

export function sealBlock(secret: string, address: string, origin: string, nowSecs: number) {
  return seal({ secret, salt: BLOCK_SALT }, { a: address, o: origin, e: nowSecs + BLOCK_TTL_SECS });
}

export function openBlock(secret: string, blob: string, nowSecs: number): Promise<Block | null> {
  return open({ secret, salt: BLOCK_SALT }, blob, nowSecs, Block);
}

export function blockUrl(publicUrl: string, blob: string): string {
  return `${publicUrl}/block/${blob}`;
}

/**
 * The marks the relay keeps, none of which names a server or a mailbox: one
 * per origin a mailbox activated, and one per (origin, mailbox) that opted out.
 */
export class Marks {
  constructor(
    private readonly kv: Counters,
    private readonly secret: string,
  ) {}

  private originKey(origin: string): Promise<string> {
    return budgetKey(this.secret, origin);
  }

  private pairKey(origin: string, address: string): Promise<string> {
    return budgetKey(this.secret, `${origin.toLowerCase()} ${address}`);
  }

  async active(origin: string): Promise<boolean> {
    return (await this.kv.get(`active:${await this.originKey(origin)}`)) !== null;
  }

  /** Record that a mailbox allowed this origin to send. */
  async activate(origin: string, by: string): Promise<void> {
    await this.kv.put(`active:${await this.originKey(origin)}`, await this.pairKey(origin, by), {
      expirationTtl: ACTIVE_TTL_SECS,
    });
  }

  /** Keep an activation alive after a delivery, whoever it was to. */
  async refresh(origin: string): Promise<void> {
    const key = `active:${await this.originKey(origin)}`;
    const by = await this.kv.get(key);
    if (by !== null) await this.kv.put(key, by, { expirationTtl: ACTIVE_TTL_SECS });
  }

  /** Withdraw the activation when `address` is the mailbox that gave it. */
  async deactivateBy(origin: string, address: string): Promise<void> {
    const key = `active:${await this.originKey(origin)}`;
    if ((await this.kv.get(key)) === (await this.pairKey(origin, address))) {
      await this.kv.delete(key);
    }
  }

  async blocked(origin: string, address: string): Promise<boolean> {
    return (await this.kv.get(`block:${await this.pairKey(origin, address)}`)) !== null;
  }

  /** The mailbox opted out of this origin, bounced, or reported it. */
  async block(origin: string, address: string): Promise<void> {
    await this.kv.put(`block:${await this.pairKey(origin, address)}`, '1', {
      expirationTtl: BLOCK_TTL_SECS,
    });
  }
}
