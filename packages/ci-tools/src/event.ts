import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Sha = z.string().regex(/^[0-9a-f]{40}$/);

const PullRequestEvent = z.object({
  number: z.number().int().positive(),
  pull_request: z.object({
    base: z.object({ sha: Sha, ref: z.string().min(1) }),
    head: z.object({ sha: Sha }),
  }),
});

const PushEvent = z.object({ before: Sha, after: Sha });

export type Event =
  | { kind: 'pull_request'; number: number; base: string; head: string }
  | { kind: 'push'; before: string; after: string }
  | { kind: 'other'; name: string }
  | { kind: 'local' };

/** The event this run answers, read the way Actions hands it over. */
export function readEvent(env: NodeJS.ProcessEnv = process.env): Event {
  const name = env.GITHUB_EVENT_NAME;
  const path = env.GITHUB_EVENT_PATH;
  if (!name || !path) return { kind: 'local' };

  const payload: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (name === 'pull_request' || name === 'pull_request_target') {
    const { number, pull_request: pr } = PullRequestEvent.parse(payload);
    return { kind: 'pull_request', number, base: pr.base.sha, head: pr.head.sha };
  }
  if (name === 'push') {
    const { before, after } = PushEvent.parse(payload);
    return { kind: 'push', before, after };
  }
  return { kind: 'other', name };
}

export interface Repo {
  slug: string;
  token: string | undefined;
}

export function readRepo(env: NodeJS.ProcessEnv = process.env): Repo {
  const slug = env.GITHUB_REPOSITORY;
  if (!slug) throw new Error('GITHUB_REPOSITORY is not set');
  return { slug, token: env.GITHUB_TOKEN || env.GH_TOKEN };
}
