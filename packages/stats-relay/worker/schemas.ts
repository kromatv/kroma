// The collector's wire contract. Every byte reaching this Worker is untrusted,
// and it arrives from software anyone can read and change, so nothing is read
// off a request until a schema here has agreed to its shape.

import { z } from 'zod';

const InstallId = z.string().regex(/^[0-9a-f]{64}$/, 'must be a 32-byte hex token');

// Bounded as well as shaped: a regex that permits any length is a free way to
// make the collector read megabytes before deciding it did not want them.
const Tag = z
  .string()
  .trim()
  .max(16)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'must be a lowercase language tag');

const ModuleId = z
  .string()
  .trim()
  .max(128)
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, 'must be a reverse-DNS module id');

// Devices seen on one install in the last week, capped server-side at 50.
const Clients = z.object({
  tv: z.int().min(0).max(50),
  mobile: z.int().min(0).max(50),
  desktop: z.int().min(0).max(50),
});

/**
 * The payload shapes this collector understands. A new one is ADDED here, never
 * swapped in: a self-hosted server updates when its operator decides to, so
 * refusing the shape they still send drops them out of the count for as long as
 * they take.
 */
export const SUPPORTED_SCHEMAS = [2] as const;

/**
 * `POST /v1/ping`: what one install says about itself, once a day.
 *
 * Deliberately unauthenticated, for the same reason the push relay's routes
 * are: the sender is public source, so any credential shipped in it would be
 * public too. The id is the whole authorisation, and it authorises writing one
 * row and nothing else.
 *
 * The base block is required. The two detail blocks are optional as a whole,
 * because a server whose operator dropped one omits its keys rather than
 * sending them empty, and "no modules enabled" has to stay distinguishable from
 * "not telling you".
 */
export const Ping = z.object({
  schema: z.literal(SUPPORTED_SCHEMAS),
  id: InstallId,
  version: z.string().trim().min(1).max(32),
  commit: z.string().trim().min(1).max(40),
  target: z.string().trim().max(64),
  install: z.enum(['docker', 'synology', 'binary', 'unknown']),
  locales: z.array(Tag).max(32).optional(),
  modules: z.array(ModuleId).max(64).optional(),
  clients: Clients.optional(),
  users: z.enum(['1', '2-5', '6-20', '21+']).optional(),
  titles: z.enum(['0-99', '100-999', '1k-4999', '5k+']).optional(),
});
export type Ping = z.infer<typeof Ping>;

/**
 * `POST /v1/forget`: an install asks for its row to be deleted. Holding the id
 * is the whole authorisation, which is the same rule a ping runs under, and it
 * is what makes erasure something an operator can exercise rather than request.
 */
export const Forget = z.object({ id: InstallId });
export type Forget = z.infer<typeof Forget>;

/** What a body turned out to be, or the one sentence saying why it did not. */
export type Parsed<S extends z.ZodType> =
  | { ok: true; value: z.infer<S> }
  | { ok: false; error: string };

/**
 * Read one request body against the schema that decides what a route accepts.
 * Takes the text rather than the request, because the bytes have already been
 * counted through the collector's ceiling and reading them again would parse
 * bytes nobody measured.
 */
export function parse<S extends z.ZodType>(text: string, schema: S): Parsed<S> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'body is not JSON' };
  }
  const result = schema.safeParse(json);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: firstIssue(result.error) };
}

// The first problem zod found, naming the offending field and nothing else.
// Deliberately not `z.treeifyError` or the raw issue list: those echo the
// received value back, reflecting an attacker's payload into a response.
function firstIssue(error: { issues: readonly z.core.$ZodIssue[] }): string {
  const issue = error.issues[0];
  if (!issue) return 'invalid request';
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}
