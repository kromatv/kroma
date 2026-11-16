import { z } from 'zod';
import { gitHub, gitHubHeaders, refusal } from './client';
import type { OAuthCredentials } from './oauth';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);
const TreeEntry = z.object({ path: z.string(), type: z.string(), sha: Sha });
const Tree = z.object({ sha: Sha, truncated: z.boolean(), tree: z.array(TreeEntry) });
const Repository = z.object({ default_branch: z.string() });
const Pull = z.object({ state: z.enum(['open', 'closed']) });

/** One entry of a commit's tree: a blob or a sub-tree, by path. */
export type TreeEntry = z.infer<typeof TreeEntry>;

/** A commit's tree, listed whole: its own sha, every entry below it, and whether GitHub cut the list short. */
export type Tree = z.infer<typeof Tree>;

/** Where a branch points, and the ETag GitHub sent with that answer. */
export interface Seen {
  sha: string;
  etag: string | null;
}

/**
 * GitHub's public data, read without a contributor. `branchHead` asks where a
 * branch points, answering `since` itself when GitHub says the branch has not
 * moved since the answer that carried its ETag; `text` is a file's content at
 * a commit. Every request spends one of `left`: a Worker caps how many
 * subrequests one invocation makes.
 */
export interface Reader {
  readonly left: number;
  branchHead(repo: string, branch: string, since: Seen | null): Promise<Seen>;
  tree(repo: string, sha: string): Promise<Tree>;
  text(repo: string, sha: string, path: string): Promise<string>;
  pullState(repo: string, number: number): Promise<'open' | 'closed'>;
  defaultBranch(repo: string): Promise<string>;
}

/** What a reader may spend: the OAuth App it authenticates as, if any, and how many requests it may make. */
export interface Allowance {
  oauth: OAuthCredentials | null;
  requests: number;
}

function basic(oauth: OAuthCredentials): string {
  const pair = `${oauth.clientId}:${oauth.clientSecret}`;
  return `Basic ${btoa(pair)}`;
}

const rawPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

interface Wire {
  fetchFn: typeof fetch;
  authorization: string | null;
}

async function branchHeadOf(
  wire: Wire,
  at: { repo: string; branch: string; since: Seen | null },
): Promise<Seen> {
  const { fetchFn, authorization } = wire;
  const path = `/repos/${at.repo}/commits/${encodeURIComponent(at.branch)}`;
  const etag = at.since?.etag ?? null;
  const response = await fetchFn(`${API}${path}`, {
    headers: {
      ...gitHubHeaders(authorization),
      Accept: 'application/vnd.github.sha',
      ...(etag === null ? {} : { 'If-None-Match': etag }),
    },
  });
  if (response.status === 304 && at.since) {
    return at.since;
  }
  const text = await response.text();
  if (!response.ok) {
    throw refusal(response, `GET ${path}`, text);
  }
  return { sha: Sha.parse(text.trim()), etag: response.headers.get('etag') };
}

async function rawText(
  fetchFn: typeof fetch,
  at: { repo: string; sha: string; path: string },
): Promise<string> {
  const url = `${RAW}/${at.repo}/${at.sha}/${rawPath(at.path)}`;
  const response = await fetchFn(url, { headers: { 'User-Agent': 'kroma-lingua' } });
  const text = await response.text();
  if (!response.ok) {
    throw refusal(response, `GET ${url}`, text);
  }
  return text;
}

/**
 * A reader speaking to the REST API as the OAuth App, its client id and secret
 * sent as HTTP Basic, which GitHub serves public data to at the 5,000-an-hour
 * limit; anonymously without them. File contents come from
 * raw.githubusercontent.com, which needs no token.
 */
export function reader(allowance: Allowance, fetchFn: typeof fetch = fetch): Reader {
  let left = allowance.requests;
  const spending: typeof fetch = (input, init) => {
    left -= 1;
    return fetchFn(input, init);
  };
  const authorization = allowance.oauth ? basic(allowance.oauth) : null;
  const api = gitHub(authorization, spending);
  return {
    get left() {
      return left;
    },
    branchHead: (repo, branch, since) =>
      branchHeadOf({ fetchFn: spending, authorization }, { repo, branch, since }),
    tree: (repo, sha) => api.get(`/repos/${repo}/git/trees/${sha}?recursive=1`, Tree),
    text: (repo, sha, path) => rawText(spending, { repo, sha, path }),
    pullState: async (repo, number) =>
      (await api.get(`/repos/${repo}/pulls/${number}`, Pull)).state,
    defaultBranch: async (repo) => (await api.get(`/repos/${repo}`, Repository)).default_branch,
  };
}
