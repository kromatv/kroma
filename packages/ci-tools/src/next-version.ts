import type { Commit } from './commits';

const TRIPLET = /^(\d+)\.(\d+)\.(\d+)$/;

type Bump = 'major' | 'minor' | 'patch';

const RANK: Record<Bump, number> = { patch: 1, minor: 2, major: 3 };

function bumpOf(commit: Commit, preOne: boolean): Bump | null {
  if (commit.breaking) return preOne ? 'minor' : 'major';
  if (commit.type === 'feat') return preOne ? 'patch' : 'minor';
  if (commit.type === 'fix' || commit.type === 'perf') return 'patch';
  return null;
}

/**
 * The version the commits since `last` make: below 1.0 a breaking change
 * bumps the minor and anything else releasable the patch; from 1.0 on,
 * breaking is major, `feat` minor, `fix` and `perf` patch. Null when no
 * commit is releasable.
 */
export function nextVersion(last: string, commits: readonly Commit[]): string | null {
  const match = TRIPLET.exec(last);
  if (!match) throw new Error(`'${last}' is not X.Y.Z`);
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  const preOne = major === 0;
  let bump: Bump | null = null;
  for (const commit of commits) {
    const next = bumpOf(commit, preOne);
    if (next && (!bump || RANK[next] > RANK[bump])) bump = next;
  }
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return null;
}
