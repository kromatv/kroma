import { execFileSync } from 'node:child_process';
import { type Commit, parseCommit } from './commits';
import { nextVersion } from './next-version';
import { root } from './root';

const FIELD = '\x1f';
const RECORD = '\x1e';
const STABLE_TAG = 'v[0-9]*.[0-9]*.[0-9]*';
const NO_TAG = /No names found|No tags can describe|cannot describe/;

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const git = (...args: string[]) => run('git', args);

/**
 * The newest `vX.Y.Z` tag reachable from `to`, without its `v`, skipping
 * prerelease tags and `exclude`, so a re-run of a release does not find its
 * own tag. Module and vendor tags never match. Throws on a shallow clone,
 * where no tag would be found for the wrong reason.
 */
export function lastStable(to = 'HEAD', exclude?: string): string | null {
  if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
    throw new Error('a shallow clone has no tags to count from; check out with fetch-depth: 0');
  }
  const skip = exclude ? ['--exclude', `v${exclude}`] : [];
  try {
    const tag = git(
      'describe',
      '--tags',
      '--abbrev=0',
      '--match',
      STABLE_TAG,
      '--exclude',
      'v*-*',
      ...skip,
      to,
    );
    return tag.trim().slice(1) || null;
  } catch (error) {
    const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    if (NO_TAG.test(stderr)) return null;
    throw error;
  }
}

/** The full sha `ref` names. */
export const commitOf = (ref: string) => git('rev-parse', `${ref}^{commit}`).trim();

/** Every conventional commit after `since` (a tag or sha) up to `to`, oldest first. */
export function commitsSince(since: string | null, to = 'HEAD'): Commit[] {
  const range = since ? `${since}..${to}` : to;
  return git('log', '--reverse', `--format=%H${FIELD}%s${FIELD}%b${RECORD}`, range)
    .split(RECORD)
    .map((record) => record.trim().split(FIELD))
    .flatMap(([sha, subject, body]) => {
      const commit = sha && subject ? parseCommit(sha, subject, body) : null;
      return commit ? [commit] : [];
    });
}

/** The range a release at `to` covers, and the version it makes. */
export interface Heading {
  last: string | null;
  commits: Commit[];
  version: string | null;
}

/**
 * Where `to` is heading: what its commits make, the last release when none is
 * releasable, or null with no release at all. One definition for the
 * candidate, the changelog and the notes.
 */
export function heading(to = 'HEAD', exclude?: string): Heading {
  const last = lastStable(to, exclude);
  const commits = commitsSince(last ? `v${last}` : null, to);
  const version = last ? (nextVersion(last, commits) ?? last) : null;
  return { last, commits, version };
}
