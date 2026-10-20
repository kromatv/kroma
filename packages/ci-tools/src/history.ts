import { execFileSync } from 'node:child_process';
import { type Commit, parseCommit } from './commits';
import { root } from './root';

const FIELD = '\x1f';
const RECORD = '\x1e';
const STABLE_TAG = 'v[0-9]*.[0-9]*.[0-9]*';

const run = (cmd: string, args: string[]) =>
  execFileSync(cmd, args, { cwd: root, encoding: 'utf8' });
const git = (...args: string[]) => run('git', args);

/**
 * The newest `vX.Y.Z` tag reachable from `to`, without its `v`, skipping
 * `exclude` so a re-run of a release does not find its own tag. Module and
 * vendor tags never match.
 */
export function lastStable(to = 'HEAD', exclude?: string): string | null {
  const skip = exclude ? ['--exclude', `v${exclude}`] : [];
  try {
    const tag = git('describe', '--tags', '--abbrev=0', '--match', STABLE_TAG, ...skip, to);
    return tag.trim().slice(1) || null;
  } catch {
    return null;
  }
}

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
