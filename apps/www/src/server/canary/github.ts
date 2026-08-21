import { z } from 'zod';

export type Env = {
  GITHUB_REPO?: string;
  /** Needs `actions: read` and nothing else. A run artifact is the one document
   *  a public repository still refuses to serve anonymously. */
  GITHUB_TOKEN?: string;
};

export const DEFAULT_REPO = 'maxscharwath/kroma';

export const repoOf = (env: Env) => env.GITHUB_REPO || DEFAULT_REPO;

const Run = z.object({
  id: z.number().int().positive(),
  head_sha: z.string().length(40),
  html_url: z.url(),
  updated_at: z.string(),
  display_title: z.string().default(''),
});
export type Run = z.infer<typeof Run>;

const Runs = z.object({ workflow_runs: z.array(Run).default([]) });

const Artifacts = z.object({
  artifacts: z
    .array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1),
        size_in_bytes: z.number().int().nonnegative(),
        expired: z.boolean().default(false),
        expires_at: z.string().nullish(),
      }),
    )
    .default([]),
});
export type Artifact = z.infer<typeof Artifacts>['artifacts'][number];

export function headers(env: Env): HeadersInit {
  const head: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'kroma-canary-worker',
    'x-github-api-version': '2022-11-28',
  };
  if (env.GITHUB_TOKEN) head.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return head;
}

const get = (env: Env, path: string) =>
  fetch(`https://api.github.com${path}`, { headers: headers(env) });

async function api(env: Env, path: string): Promise<unknown> {
  const res = await get(env, path);
  if (!res.ok) throw new Error(`GitHub ${path} answered ${res.status}`);
  return res.json();
}

// Scoped to the one workflow that builds the fleet. Unscoped, `/actions/runs`
// answers with whichever workflow finished last - CI, Sonar, CodeQL - and none
// of those carries an installer.
//
// `event=push` only: a scheduled run publishes the nightly release, and this
// channel is for what main built without one.
const LATEST_GREEN_PUSH =
  '/actions/workflows/release.yml/runs?branch=main&status=success&event=push&exclude_pull_requests=true';

/**
 * The green builds of `main`, newest first.
 *
 * Bounded because each one costs a second call for its artifacts, and because
 * GitHub deletes an artifact ninety days after its run: past that the tail of
 * this list is runs with nothing left to hand over.
 */
export async function latestRuns(env: Env, limit: number): Promise<Run[]> {
  const runs = Runs.parse(
    await api(env, `/repos/${repoOf(env)}${LATEST_GREEN_PUSH}&per_page=${limit}`),
  );
  if (runs.workflow_runs.length === 0) throw new Error('no successful build of main');
  return runs.workflow_runs;
}

/**
 * The artifacts still attached to a run, or null when there is no such run.
 *
 * A well-formed id for a run that never existed is the caller's mistake, not an
 * outage: a 404 answers null, every other failure throws.
 */
export async function artifactsOf(env: Env, runId: number): Promise<Artifact[] | null> {
  const res = await get(env, `/repos/${repoOf(env)}/actions/runs/${runId}/artifacts?per_page=100`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub artifacts for run ${runId} answered ${res.status}`);
  const { artifacts } = Artifacts.parse(await res.json());
  return artifacts.filter((a) => !a.expired);
}

/**
 * The version the manifest carried at that exact commit, or null when it cannot
 * be read. Taken from the manifest rather than the run, because the run does not
 * record it.
 */
export async function versionAt(env: Env, sha: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${repoOf(env)}/${sha}/server/Cargo.toml`,
      { headers: { 'user-agent': 'kroma-canary-worker' } },
    );
    if (!res.ok) return null;
    return /^version\s*=\s*"([^"]+)"/m.exec(await res.text())?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The signed storage URL GitHub answers an artifact download with, so the bytes
 * travel from its storage straight to the caller and never through this worker.
 */
export async function signedUrl(env: Env, artifactId: number): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${repoOf(env)}/actions/artifacts/${artifactId}/zip`,
    { headers: headers(env), redirect: 'manual' },
  );
  return res.headers.get('location');
}
