import { z } from 'zod';

const IssueSchema = z.object({
  level: z.enum(['error', 'warning']),
  code: z.enum(['unknown-token', 'missing-token', 'unknown-ref', 'too-long', 'control-character']),
  detail: z.string().optional(),
});

const SavedSchema = z.object({ draft: z.string().nullable(), issues: z.array(IssueSchema) });

const ProposedSchema = z.union([
  z.object({ kind: z.literal('proposed'), number: z.number(), url: z.string() }),
  z.object({ kind: z.literal('nothing') }),
  z.object({
    kind: z.literal('authorize'),
    url: z.string().startsWith('https://github.com/login/oauth/authorize?'),
  }),
]);

const ConfirmedSchema = z.object({ confirmed: z.array(z.string()) });

const StartedSchema = z.object({ locale: z.string(), name: z.string() });

const FailureSchema = z.object({ error: z.string(), issues: z.array(IssueSchema).optional() });

/** What the server answered a save with: the draft it now holds (null when the edit was dropped) and what it found. */
export type Saved = z.infer<typeof SavedSchema>;

/** What sending a language's edits came to: the pull request carrying them, nothing left to send, or GitHub's page asking the contributor to let Lingua send as them. */
export type Proposed = z.infer<typeof ProposedSchema>;

/** A refused request, with the one sentence saying why and, for a save, the issues that blocked it. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: z.infer<typeof IssueSchema>[] = [],
  ) {
    super(message);
  }
}

async function call<S extends z.ZodType>({
  method,
  path,
  body,
  schema,
}: {
  method: string;
  path: string;
  body: unknown;
  schema: S;
}): Promise<z.infer<S>> {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = FailureSchema.safeParse(json);
    throw new ApiError(
      response.status,
      failure.success ? failure.data.error : response.statusText,
      failure.success ? (failure.data.issues ?? []) : [],
    );
  }
  return schema.parse(json);
}

/** Save the viewer's edit of one message. An empty value, or the branch's own text, drops the edit. */
export function saveEdit(edit: {
  project: string;
  locale: string;
  file: string;
  key: string;
  value: string;
}): Promise<Saved> {
  return call({ method: 'PUT', path: '/api/edits', body: edit, schema: SavedSchema });
}

/**
 * Send every edit the viewer holds for a language to its pull request, opening
 * it the first time, from their fork once GitHub has their permission. GitHub
 * comes back to the page `to`.
 */
export function sendProposal(target: {
  project: string;
  locale: string;
  to: string;
}): Promise<Proposed> {
  return call({ method: 'POST', path: '/api/proposals', body: target, schema: ProposedSchema });
}

/** Keep the viewer's word that these messages of a language read right as they are; their next send records it. Answers the base keys kept. */
export async function confirmMessages(target: {
  project: string;
  locale: string;
  keys: string[];
}): Promise<string[]> {
  const answer = await call({
    method: 'POST',
    path: '/api/confirm',
    body: target,
    schema: ConfirmedSchema,
  });
  return answer.confirmed;
}

/** Start translating a project into a language the viewer alone sees until they send it. */
export function startLanguage(target: {
  project: string;
  locale: string;
}): Promise<z.infer<typeof StartedSchema>> {
  return call({ method: 'POST', path: '/api/locales', body: target, schema: StartedSchema });
}

/** Where to send the browser to sign in with GitHub and come back to `returnTo`. */
export function signInUrl(returnTo: string): string {
  return `/auth/login?to=${encodeURIComponent(returnTo)}`;
}

const RepositorySchema = z.object({
  id: z.string(),
  branch: z.string().nullable(),
  checkedAt: z.number().nullable(),
  sync: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('waiting') }),
    z.object({
      kind: z.literal('reading'),
      progress: z.object({ done: z.number(), total: z.number() }).nullable(),
    }),
    z.object({ kind: z.literal('current') }),
    z.object({ kind: z.literal('failed'), error: z.string() }),
  ]),
  configError: z.string().nullable(),
});

/** Where a repository's sync stands, as a sync by hand answers it. */
export type Repository = z.infer<typeof RepositorySchema>;

/** Read repository `project` now: one pass, as far as one request may go. Call again while it is still `reading`. */
export function syncRepository(project: string): Promise<Repository> {
  return call({ method: 'POST', path: '/api/sync', body: { project }, schema: RepositorySchema });
}
