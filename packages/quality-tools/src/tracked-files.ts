import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';
import { sourceFiles, underPaths } from './sources';

/** Every file git tracks that is still on disk, as paths from the repository root. */
export async function trackedFiles(root: string): Promise<string[]> {
  const listed = await $`git ls-files -z`.cwd(root).quiet().text();
  return listed.split('\0').filter((path) => path.length > 0 && existsSync(join(root, path)));
}

/**
 * The source list every tool is handed, narrowed to `paths`. The tools walk
 * the disk when given a directory and take a path that does not exist for a
 * name filter, so they only ever get tracked files that are present.
 */
export async function measuredSources(root: string, paths: readonly string[]): Promise<string[]> {
  const sources = underPaths(sourceFiles(await trackedFiles(root)), paths);
  if (sources.length === 0) {
    throw new Error('no measured source file under the given paths');
  }
  return sources;
}
