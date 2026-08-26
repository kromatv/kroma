// The collector's wire contract. Every byte reaching this Worker is untrusted,
// and it arrives from software anyone can read and change, so nothing is read
// off a request until a schema here has agreed to its shape.

import { z } from 'zod';

const Tag = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a lowercase language tag');

const ModuleId = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'must be a reverse-DNS module id');

// Devices seen on one install in the last week, capped server-side at 50.
const Clients = z.object({
  tv: z.int().min(0).max(50),
  mobile: z.int().min(0).max(50),
  desktop: z.int().min(0).max(50),
});

/**
 * `POST /v1/ping`: what one install says about itself, once a day.
 *
 * Deliberately unauthenticated, for the same reason the push relay's routes
 * are: the sender is public source, so any credential shipped in it would be
 * public too. The id is the whole authorisation, and it authorises writing one
 * row and nothing else.
 */
export const Ping = z.object({
  schema: z.literal(1),
  id: z.string().regex(/^[0-9a-f]{64}$/, 'must be a 32-byte hex token'),
  version: z.string().trim().min(1).max(32),
  commit: z.string().trim().min(1).max(40),
  target: z.string().trim().max(64),
  install: z.enum(['docker', 'synology', 'binary', 'unknown']),
  clients: Clients,
  locales: z.array(Tag).max(32),
  modules: z.array(ModuleId).max(64),
  users: z.enum(['1', '2-5', '6-20', '21+']),
  titles: z.enum(['0-99', '100-999', '1k-4999', '5k+']),
});
export type Ping = z.infer<typeof Ping>;

/**
 * The first problem zod found, naming the offending field and nothing else.
 * Deliberately not `z.treeifyError` or the raw issue list: those echo the
 * received value back, reflecting an attacker's payload into a response.
 */
export function firstIssue(error: { issues: readonly z.core.$ZodIssue[] }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
