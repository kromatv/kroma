// The relay's wire contract. Every byte reaching this Worker is untrusted, so nothing is read
// off a request until a schema here has agreed to its shape.

import { z } from 'zod';

export const Transport = z.enum(['apns', 'fcm']);
export type Transport = z.infer<typeof Transport>;

export const Urgency = z.enum(['low', 'normal', 'high']);
export type Urgency = z.infer<typeof Urgency>;

/** An actionable button. Only `api` actions reach a native payload; a link is
 * plain navigation the tap handler already covers. */
export const Action = z.object({
  id: z.string().min(1),
  method: z.string().min(1).default('POST'),
  href: z.string().min(1),
});
export type Action = z.infer<typeof Action>;

/**
 * What a server may ask the relay to deliver: structure, not a finished Apple or
 * Google payload. The topic, push type, priority and collapse key are the
 * relay's to set — a caller that could supply them could address another app or
 * promote a digest to a radio-waking alert.
 */
export const Notification = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  body: z.string().max(1024).default(''),
  link: z.string().max(1024).optional(),
  imageUrl: z.string().max(2048).optional(),
  category: z.string().max(64).optional(),
  threadId: z.string().max(64).optional(),
  actions: z.array(Action).max(4).default([]),
  urgency: Urgency.default('high'),
});
export type Notification = z.infer<typeof Notification>;

/** `POST /v1/grant` — the app trades its device token for a capability. */
export const GrantRequest = z.object({
  transport: Transport,
  // Bounded: a real token is far shorter, and an unbounded string is a free
  // way to make the relay do work.
  token: z.string().trim().min(1).max(1024),
});
export type GrantRequest = z.infer<typeof GrantRequest>;

/** `POST /v1/push` — a server spends a grant. */
export const PushRequest = z.object({
  grant: z.string().min(1).max(4096),
  notification: Notification,
});
export type PushRequest = z.infer<typeof PushRequest>;

/** What one transport made of one send, in a shape neutral across Apple and
 * Google. */
export interface Delivery {
  ok: boolean;
  gone: boolean;
  status: number;
  reason?: string;
}

/**
 * The first problem zod found, naming the offending field and nothing else.
 * Deliberately not `z.treeifyError` or the raw issue list — those echo the
 * received value back, reflecting an attacker's payload into a response.
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
