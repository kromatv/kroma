/** The relay's wire contract, as zod schemas.
 *
 * Every byte reaching this Worker is untrusted — a self-hosted server anyone
 * can run, or anyone at all posting to a public endpoint — so nothing is read
 * off a request until a schema has agreed to its shape. Declaring that shape
 * once, here, is also what keeps `index.ts` readable: a handler validates in one
 * line and then works with a real type instead of `Record<string, unknown>`.
 *
 * Mirrors `packages/client/src/schemas`, which is where the rest of KROMA keeps
 * its runtime schemas.
 */

import { z } from 'zod';

/** Which service a sealed device token belongs to. */
export const Transport = z.enum(['apns', 'fcm']);
export type Transport = z.infer<typeof Transport>;

export const Urgency = z.enum(['low', 'normal', 'high']);
export type Urgency = z.infer<typeof Urgency>;

/** An actionable button. Only `api` actions reach a native payload — a link is
 * plain navigation the tap handler already covers — so the server sends just
 * these three fields. */
export const Action = z.object({
  id: z.string().min(1),
  method: z.string().min(1).default('POST'),
  href: z.string().min(1),
});
export type Action = z.infer<typeof Action>;

/**
 * What a server may ask the relay to deliver.
 *
 * STRUCTURE, not a finished Apple or Google payload: the relay decides the
 * topic, the push type, the priority and the collapse key. A caller that could
 * hand over a built payload could also address another app or promote a digest
 * to a radio-waking alert, so those fields are deliberately absent here.
 */
export const Notification = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  body: z.string().max(1024).default(''),
  link: z.string().max(1024).optional(),
  imageUrl: z.string().max(2048).optional(),
  /** The action set the app registered, if this notification names one. */
  category: z.string().max(64).optional(),
  /** Groups related notifications in the shade. */
  threadId: z.string().max(64).optional(),
  actions: z.array(Action).max(4).default([]),
  urgency: Urgency.default('high'),
});
export type Notification = z.infer<typeof Notification>;

/** `POST /v1/grant` — the app trades its device token for a capability. */
export const GrantRequest = z.object({
  transport: Transport,
  /** The raw APNs/FCM token. Bounded because a real one is far shorter, and an
   * unbounded string is a free way to make the relay do work. */
  token: z.string().trim().min(1).max(1024),
});
export type GrantRequest = z.infer<typeof GrantRequest>;

/** `POST /v1/push` — a server spends a grant. */
export const PushRequest = z.object({
  grant: z.string().min(1).max(4096),
  notification: Notification,
});
export type PushRequest = z.infer<typeof PushRequest>;

/**
 * What one transport made of one send. Transport-neutral on purpose: `index.ts`
 * dispatches to Apple or Google and then answers the caller identically, so this
 * belongs beside the other shared wire types rather than inside whichever
 * transport happened to define it first.
 */
export interface Delivery {
  /** Whether the service accepted it. */
  ok: boolean;
  /** Whether this device is permanently gone and should be dropped. */
  gone: boolean;
  status: number;
  reason?: string;
}

/**
 * The first problem zod found, as an error body: it names the offending field
 * and nothing else. Deliberately not `z.treeifyError` or the raw issue list —
 * those echo the received value back, which for this Worker means reflecting an
 * attacker's payload into a response.
 *
 * Typed structurally rather than as `z.ZodError` because `@hono/zod-validator`
 * hands back zod v4's core `$ZodError`, which is not the same class.
 */
export function firstIssue(error: { issues: readonly z.core.$ZodIssue[] }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
