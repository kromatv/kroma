import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { addedFile, type ChangedFile, parseDiff } from './changes';

/** The commit a branch left `ref` at: what its changes are measured against. */
export async function mergeBase(root: string, ref: string): Promise<string> {
  const found = await $`git merge-base ${ref} HEAD`.cwd(root).quiet().nothrow();
  if (found.exitCode !== 0) {
    throw new Error(`no common commit with ${ref}: fetch it, or name another with --base`);
  }
  return found.stdout.toString().trim();
}

/**
 * Every file the working tree adds or modifies against `base`, committed or
 * not, with its changed lines. A file git does not track yet counts as added.
 */
export async function changedFiles(root: string, base: string): Promise<ChangedFile[]> {
  const diff = await $`git diff -U0 --no-renames --diff-filter=AM ${base}`.cwd(root).quiet().text();
  const untracked = await $`git ls-files -z --others --exclude-standard`.cwd(root).quiet().text();
  const added = untracked.split('\0').filter((file) => file.length > 0);
  return [...parseDiff(diff), ...added.map(addedFile)].filter((change) =>
    existsSync(join(root, change.file)),
  );
}

export interface BaseCopy {
  root: string;
  base: string;
  into: string;
}

/** Writes the `base` version of each file under `into`, at the path it has in the repository. */
export async function checkOutBase(copy: BaseCopy, files: readonly string[]): Promise<void> {
  mkdirSync(copy.into, { recursive: true });
  if (files.length > 0) {
    await $`git archive ${copy.base} -- ${[...files]} | tar -x -C ${copy.into}`
      .cwd(copy.root)
      .quiet();
  }
}
