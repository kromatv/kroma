import type { Project, Proposal, User } from '#site/store/store';
import type { At } from './branch';
import type { GitHub } from './client';
import { type Forking, forkOf, syncFork } from './fork';

/** Who writes a send: the App, on a branch of the project, or the contributor, on their own fork. */
export type Sender = { kind: 'app'; gh: GitHub } | ({ kind: 'fork' } & Forking);

/**
 * Where a send goes: the repository its branch is pushed to (`at`), the one its
 * pull request opens on (`upstream`), the head that pull request names, and
 * whether a branch already there starts over from the default branch.
 */
export interface Lane {
  at: At;
  upstream: At;
  branch: string;
  head: string;
  restart: boolean;
}

/** The branch of the project the App pushes one contributor's suggestions for one language to. */
export function branchFor(login: string, locale: string): string {
  return `lingua/${login.toLowerCase()}/${locale}`;
}

/** How a proposal names a branch of a contributor's fork: `<owner>:<branch>`, the owner lower-cased. */
export function forkHead(owner: string, branch: string): string {
  return `${owner.toLowerCase()}:${branch}`;
}

/**
 * The lane `sender` takes for one contributor's language. On a fork, the branch
 * `lingua/<locale>` starts over unless `open` is the pull request it carries,
 * so a branch left behind by a merged pull request does not carry its commits again.
 */
export async function laneFor(
  sender: Sender,
  send: { project: Project; user: User; locale: string },
  open: Proposal | null,
): Promise<Lane> {
  const { project, user, locale } = send;
  const upstream = { gh: sender.gh, repo: project.id };
  if (sender.kind === 'app') {
    const branch = branchFor(user.login, locale);
    return { at: upstream, upstream, branch, head: branch, restart: false };
  }
  const at = await forkOf(sender, project.id, user.login);
  await syncFork(at, project.branch);
  const branch = `lingua/${locale}`;
  const head = forkHead(at.repo.split('/')[0] ?? user.login, branch);
  return { at, upstream, branch, head, restart: open?.branch !== head };
}
