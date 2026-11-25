import { execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';
import type { BaseFile } from './version-bump.ts';

/** One git command run in `dir`: what it printed, or `null` where it failed. */
export type Git = (dir: string, args: readonly string[]) => string | null;

const runGit: Git = (dir, args) => {
  try {
    return execFileSync('git', ['-C', dir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
};

const MAIN_LINE = ['origin/main', 'main'];

/** A file as `git` has it where this branch left `origin/main`, or `main`
 *  where there is no such remote. `null` outside git, with neither branch, or
 *  where the file did not exist yet. */
export function baseReader(git: Git): BaseFile {
  return (path) => {
    const dir = dirname(path);
    const base = MAIN_LINE.map((ref) => git(dir, ['merge-base', 'HEAD', ref])).find(
      (found) => found !== null,
    );
    return base ? git(dir, ['show', `${base.trim()}:./${basename(path)}`]) : null;
  };
}

/** {@link baseReader} over the `git` command. */
export const gitBase: BaseFile = baseReader(runGit);
