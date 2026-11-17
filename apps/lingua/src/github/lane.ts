import type { Project, Proposal, User } from '#site/store/store';
import type { At } from './branch';
import { type Forking, forkOf, syncFork } from './fork';

/**
 * Where a send goes: the contributor's fork its branch is pushed to (`at`),
 * the repository its pull request opens on (`upstream`), the head that pull
 * request names, and whether a branch already there starts over from the
 * default branch.
 */
export interface Lane {
  at: At;
  upstream: At;
  branch: string;
  head: string;
  restart: boolean;
}

const forkHead = (owner: string, branch: string) => `${owner.toLowerCase()}:${branch}`;

/**
 * The lane one contributor's language takes: the branch `lingua/<locale>` of
 * their fork, which starts over unless `open` is the pull request it carries,
 * so a branch left behind by a merged pull request does not carry its commits again.
 */
export async function laneFor(
  forking: Forking,
  send: { project: Project; user: User; locale: string },
  open: Proposal | null,
): Promise<Lane> {
  const { project, user, locale } = send;
  const upstream = { gh: forking.gh, repo: project.id };
  const at = await forkOf(forking, project.id, user.login);
  await syncFork(at, project.branch);
  const branch = `lingua/${locale}`;
  const head = forkHead(at.repo.split('/')[0] ?? user.login, branch);
  return { at, upstream, branch, head, restart: open?.branch !== head };
}
