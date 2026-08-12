// When each component and each guide was written, read from git at BUILD time.
//
// There is no git at run time: Metro has none, and a deployed workbench is
// static files on a CDN. So the history is extracted here, once, and shipped as
// data - the same bargain as props-docs.ts.
//
// The whole log is read in ONE pass. `git log --follow` takes a single path, so
// following the renames of ninety components would be ninety processes; the pass
// in git-history-parse.ts follows all of them at once, which is also the only
// way a component moved by a folder restructure reports the date it was written
// rather than the date it was moved.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  attribute,
  entriesOf,
  type GitHistory,
  groupFiles,
  LOG_FORMAT,
  parseLog,
  parseStatus,
  splitPaths,
} from './git-history-parse.ts';

export type { GitHistory, HistoryCommit, HistoryEntry } from './git-history-parse.ts';

const run = promisify(execFile);

// The whole log with its name-status is megabytes on a repository of any age,
// and the default buffer is one.
const MAX_OUTPUT = 256 * 1024 * 1024;

// What a panel can show without becoming a changelog. The dates are read from
// the whole history either way.
const COMMITS_KEPT = 6;

/** Where the history is read from: `repo` is any directory inside the checkout,
 * `root` the repository-relative tree whose files are scanned. */
export interface GitHistoryOptions {
  repo: string;
  root: string;
}

/** Nothing at all: what a build made from a tarball, or with no git on the
 * path, ships. */
export const NO_HISTORY: GitHistory = { entries: {}, shallow: false };

async function git(repo: string, args: readonly string[]): Promise<string> {
  const { stdout } = await run('git', [...args], { cwd: repo, maxBuffer: MAX_OUTPUT });
  return stdout;
}

const statusArgs = (root: string) => [
  'status',
  '--porcelain',
  '-z',
  '--untracked-files=all',
  '--',
  root,
];

/**
 * A hash of everything the history is derived from: the revision, and the
 * working tree's own changes on top of it. Two cheap git calls, so a build that
 * has already extracted this revision pays them and nothing else.
 */
export async function historyFingerprint({ repo, root }: GitHistoryOptions): Promise<string> {
  const head = await git(repo, ['rev-parse', 'HEAD']);
  const status = await git(repo, statusArgs(root));
  return `${head.trim()}\n${status}`;
}

/**
 * Every component's and every article's history under `root`.
 *
 * Empty for a shallow clone, which CI often makes: the earliest commit such a
 * clone holds is not the commit a file was written in, and a creation date that
 * is merely the depth of the fetch is worse than no date at all.
 */
export async function readGitHistory({ repo, root }: GitHistoryOptions): Promise<GitHistory> {
  const shallow = (await git(repo, ['rev-parse', '--is-shallow-repository'])).trim() === 'true';
  if (shallow) return { ...NO_HISTORY, shallow: true };

  const tracked = splitPaths(await git(repo, ['ls-files', '-z', '--', root]));
  const working = parseStatus(await git(repo, statusArgs(root)));
  const files = [...new Set([...tracked, ...working.untracked])].sort();

  // A path the index has already moved is looked for under the name HEAD still
  // knows it by; anything else is looked for under its own.
  const targets = new Map(files.map((file) => [file, working.renamedFrom.get(file) ?? file]));
  const log = parseLog(
    await git(repo, ['log', '--no-merges', '-M', '--name-status', '-z', LOG_FORMAT]),
  );
  const commits = attribute(log, targets);
  return {
    entries: entriesOf(groupFiles(files), commits, working.dirty, COMMITS_KEPT),
    shallow: false,
  };
}
