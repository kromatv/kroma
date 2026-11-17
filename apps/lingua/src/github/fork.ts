import { z } from 'zod';
import type { At } from './branch';
import { type GitHub, GitHubError, unlessMissing, type Write } from './client';

const Repository = z.object({
  full_name: z.string(),
  fork: z.boolean(),
  parent: z.object({ full_name: z.string() }).optional(),
});

type Repository = z.infer<typeof Repository>;

const LOOKS = 10;
const PAUSE_MS = 1500;

/** GitHub accepted the fork but had not finished making it after every look. */
export class ForkPending extends Error {}

/** The fork's default branch conflicts with the project's, so GitHub cannot bring it level. */
export class ForkDiverged extends Error {}

/** The contributor's GitHub, and how to pause between two looks at a fork GitHub is still making. */
export interface Forking {
  gh: GitHub;
  wait?: (ms: number) => Promise<void>;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const repository = (gh: GitHub, repo: string) =>
  unlessMissing(gh.get(`/repos/${repo}`, Repository));

const isForkOf = (repo: Repository, upstream: string) =>
  repo.fork && repo.parent?.full_name.toLowerCase() === upstream.toLowerCase();

async function made(forking: Forking, repo: string, looks: number): Promise<string> {
  const found = await repository(forking.gh, repo);
  if (found) {
    return found.full_name;
  }
  if (looks <= 1) {
    throw new ForkPending(`GitHub is still making ${repo}`);
  }
  await (forking.wait ?? pause)(PAUSE_MS);
  return made(forking, repo, looks - 1);
}

/** The contributor's fork of `upstream`: the one `login` has, else a new one, once GitHub answers for it. */
export async function forkOf(forking: Forking, upstream: string, login: string): Promise<At> {
  const name = upstream.split('/')[1] ?? '';
  const mine = await repository(forking.gh, `${login}/${name}`);
  if (mine && isForkOf(mine, upstream)) {
    return { gh: forking.gh, repo: mine.full_name };
  }
  const asked = await forking.gh.send(
    { method: 'POST', path: `/repos/${upstream}/forks`, body: { default_branch_only: true } },
    Repository,
  );
  return { gh: forking.gh, repo: await made(forking, asked.full_name, LOOKS) };
}

/** Bring the fork's `branch` level with the same branch of the repository it was forked from. */
export async function syncFork(fork: At, branch: string): Promise<void> {
  const merge: Write = {
    method: 'POST',
    path: `/repos/${fork.repo}/merge-upstream`,
    body: { branch },
  };
  await fork.gh.send(merge, z.unknown()).catch((error: unknown) => {
    throw error instanceof GitHubError && error.status === 409
      ? new ForkDiverged(`${fork.repo} has diverged from its parent`)
      : error;
  });
}
