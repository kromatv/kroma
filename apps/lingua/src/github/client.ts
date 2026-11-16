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
  authorization: string;
  fetchFn: typeof fetch;
}

async function request(
  session: Session,
  write: Write | { method: 'GET'; path: string },
): Promise<unknown> {
  const body = 'body' in write ? write.body : undefined;
  const response = await session.fetchFn(`${API}${write.path}`, {
    method: write.method,
    headers: {
      Authorization: session.authorization,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'kroma-lingua',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = ErrorBody.safeParse(json).data?.message ?? response.statusText;
    throw new GitHubError(response.status, `${write.method} ${write.path}: ${message}`);
  }
  return json;
}

/** A client speaking with `authorization` (`Bearer <token>`), through `fetchFn`. */
export function gitHub(authorization: string, fetchFn: typeof fetch = fetch): GitHub {
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
