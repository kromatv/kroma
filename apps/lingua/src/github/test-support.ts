import { generateKeyPairSync } from 'node:crypto';
import { z } from 'zod';
import type { AppCredentials } from './app';
import { type GitHub, GitHubError } from './client';

/** One request a fake GitHub received. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

type Handler = (body: unknown) => unknown;

/** What a fake GitHub holds: REST answers by `METHOD /path`, blob texts by oid, and blob oids by `sha:path`. */
export interface FakeRepository {
  routes: Record<string, Handler>;
  blobs?: Record<string, string>;
  paths?: Record<string, string>;
}

/** The forty-hex id `seed` names, so a test reads `sha('a')` rather than a constant. */
export function sha(seed: string): string {
  return seed.repeat(40).slice(0, 40);
}

/** Answer as GitHub does for a repository or a branch that does not exist. */
export function missing(): never {
  throw new GitHubError(404, 'Not Found');
}

/** One contributor's fork of a project: `repo` forked from `upstream`, its send branch, and how it stands before the first call. */
export interface Fork {
  upstream: string;
  repo: string;
  branch: string;
  made?: boolean;
  head?: string;
}

const Moved = z.object({ sha: z.string() });

function forkGit(fork: Fork, state: { head: string | null; commits: number }) {
  const at = `/repos/${fork.repo}`;
  const moved = (body: unknown) => {
    state.head = Moved.parse(body).sha;
    return {};
  };
  const commits = ['1', '2', '3', '9'].map((seed) => [
    `GET ${at}/git/commits/${sha(seed)}`,
    () => ({ sha: sha(seed), tree: { sha: sha('0d') } }),
  ]);
  return {
    ...Object.fromEntries(commits),
    [`GET ${at}/git/ref/heads/${fork.branch}`]: () =>
      state.head ? { object: { sha: state.head } } : missing(),
    [`POST ${at}/merges`]: () => null,
    [`POST ${at}/git/trees`]: () => ({ sha: sha('e') }),
    [`POST ${at}/git/commits`]: () => ({ sha: sha(String(++state.commits)) }),
    [`POST ${at}/git/refs`]: moved,
    [`PATCH ${at}/git/refs/heads/${fork.branch}`]: moved,
  };
}

/**
 * GitHub as the owner of `fork` sees it: the fork missing until a POST to
 * `/forks` makes it, its branch moved by every write, each commit `sha('1')`,
 * `sha('2')`, …, and the pull requests opened from it listed by head.
 */
export function forkRoutes(fork: Fork): Record<string, Handler> {
  const state = { made: fork.made ?? false, head: fork.head ?? null, commits: 0 };
  const pulls: { number: number; html_url: string }[] = [];
  const owner = fork.repo.split('/')[0] ?? '';
  const shown = () =>
    state.made
      ? { full_name: fork.repo, fork: true, parent: { full_name: fork.upstream } }
      : missing();
  const open = () => {
    pulls.push({ number: 9, html_url: `https://github.com/${fork.upstream}/pull/9` });
    return pulls[0];
  };
  return {
    ...forkGit(fork, state),
    [`GET /repos/${fork.repo}`]: shown,
    [`POST /repos/${fork.upstream}/forks`]: () => {
      state.made = true;
      return shown();
    },
    [`POST /repos/${fork.repo}/merge-upstream`]: () => ({ merge_type: 'fast-forward' }),
    [`GET /repos/${fork.upstream}/pulls?state=open&head=${owner}:${encodeURIComponent(fork.branch)}`]:
      () => pulls,
    [`POST /repos/${fork.upstream}/pulls`]: open,
  };
}

function answer(fake: FakeRepository, call: Call): unknown {
  const handler = fake.routes[`${call.method} ${call.path}`];
  if (!handler) {
    throw new GitHubError(404, `${call.method} ${call.path}: Not Found`);
  }
  return handler(call.body);
}

function blobAliases(fake: FakeRepository, query: string): [string, unknown][] {
  return [...query.matchAll(/(b\d+): object\(oid: "([0-9a-f]{40})"\)/g)].map(
    ([, alias = '', oid = '']) => {
      const text = fake.blobs?.[oid];
      return [alias, text === undefined ? null : { text }];
    },
  );
}

function pathAliases(fake: FakeRepository, query: string): [string, unknown][] {
  return [...query.matchAll(/(p\d+): object\(expression: "([^"]+)"\)/g)].map(
    ([, alias = '', expression = '']) => {
      const oid = fake.paths?.[expression];
      return [alias, oid ? { oid } : null];
    },
  );
}

function repositoryOf(fake: FakeRepository, query: string): Record<string, unknown> {
  return Object.fromEntries([...blobAliases(fake, query), ...pathAliases(fake, query)]);
}

const GraphQLBody = z.object({ query: z.string() });

function respond(fake: FakeRepository, call: Call): Response {
  if (call.path === '/graphql') {
    const { query } = GraphQLBody.parse(call.body);
    return Response.json({ data: { repository: repositoryOf(fake, query) } });
  }
  try {
    return Response.json(answer(fake, call));
  } catch (error) {
    if (!(error instanceof GitHubError)) {
      throw error;
    }
    return Response.json({ message: error.message }, { status: error.status });
  }
}

function urlOf(input: RequestInfo | URL): URL {
  return new URL(input instanceof Request ? input.url : input);
}

/**
 * GitHub over HTTP, as `fetch` reaches it: REST routes from `fake` by
 * `METHOD /path?query` on any GitHub host, GraphQL blob reads from its blobs,
 * a 404 with GitHub's message for anything else. Records every call.
 */
export function gitHubFetch(fake: FakeRepository): typeof fetch & { calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call = { method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, body };
    calls.push(call);
    return respond(fake, call);
  };
  return Object.assign(fetchFn, { calls });
}

/** A GitHub App with a freshly minted RSA key, as its `wrangler secret`s hold it. */
export function testApp(): AppCredentials {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { appId: '1', privateKey, webhookSecret: 'whsec' };
}

/** A GitHub answering from `fake`, 404 for any route it does not hold, recording every call. */
export function fakeGitHub(fake: FakeRepository): GitHub & { calls: Call[] } {
  const calls: Call[] = [];
  const record = (call: Call) => {
    calls.push(call);
    return answer(fake, call);
  };
  return {
    calls,
    get: async <S extends z.ZodType>(path: string, schema: S) =>
      schema.parse(record({ method: 'GET', path, body: undefined })),
    send: async (write, schema) =>
      schema.parse(record({ method: write.method, path: write.path, body: write.body })),
    async graphql(query, schema) {
      calls.push({ method: 'GRAPHQL', path: query, body: undefined });
      return schema.parse({ repository: repositoryOf(fake, query) });
    },
  };
}
