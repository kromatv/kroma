import { z } from 'zod';

const API = 'https://api.github.com';

/** A GitHub answer that was not a success, with the status a caller branches on. */
export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What `pending` resolves to, or null when GitHub answers that there is no such thing. */
export async function unlessMissing<T>(pending: Promise<T>): Promise<T | null> {
  try {
    return await pending;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** A write to GitHub's REST API. */
export interface Write {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

/** One authenticated door to GitHub's REST and GraphQL APIs. Every answer is read through a schema. */
export interface GitHub {
  get<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>>;
  send<S extends z.ZodType>(write: Write, schema: S): Promise<z.infer<S>>;
  graphql<S extends z.ZodType>(
    query: string,
    schema: S,
    variables?: Record<string, unknown>,
  ): Promise<z.infer<S>>;
}

const ErrorBody = z.object({ message: z.string().optional() }).loose();

const GraphQLAnswer = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

interface Session {
  authorization: string | null;
  fetchFn: typeof fetch;
}

/** The headers every request to GitHub carries: who Lingua is, and who it speaks as when `authorization` is set. */
export function gitHubHeaders(authorization: string | null): Record<string, string> {
  return {
    ...(authorization === null ? {} : { Authorization: authorization }),
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'kroma-lingua',
  };
}

/** The error a GitHub answer that was not a success reads as, with the message GitHub gave when it gave one. */
export function refusal(response: Response, what: string, text: string): GitHubError {
  return new GitHubError(response.status, `${what}: ${messageIn(text) ?? response.statusText}`);
}

function messageIn(text: string): string | undefined {
  try {
    return ErrorBody.safeParse(JSON.parse(text)).data?.message;
  } catch {
    return undefined;
  }
}

async function request(
  session: Session,
  write: Write | { method: 'GET'; path: string },
): Promise<unknown> {
  const body = 'body' in write ? write.body : undefined;
  const { fetchFn } = session;
  const response = await fetchFn(`${API}${write.path}`, {
    method: write.method,
    headers: {
      ...gitHubHeaders(session.authorization),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw refusal(response, `${write.method} ${write.path}`, text);
  }
  return text ? JSON.parse(text) : null;
}

/** A client speaking with `authorization` (`Bearer <token>`, `Basic <id:secret>`), or anonymously when it is null, through `fetchFn`. */
export function gitHub(authorization: string | null, fetchFn: typeof fetch = fetch): GitHub {
  const session = { authorization, fetchFn };
  return {
    get: async (path, schema) => schema.parse(await request(session, { method: 'GET', path })),
    send: async (write, schema) => schema.parse(await request(session, write)),
    async graphql(query, schema, variables) {
      const write: Write = { method: 'POST', path: '/graphql', body: { query, variables } };
      const answer = GraphQLAnswer.parse(await request(session, write));
      if (answer.errors?.length) {
        throw new GitHubError(200, answer.errors.map((e) => e.message).join('; '));
      }
      return schema.parse(answer.data);
    },
  };
}
