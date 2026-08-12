// The Vite plugin that serves the workbench's story sources. The reading itself
// is in story-code-read.ts, and the cache it is served through in
// virtual-cache.ts.

import { dirname, join } from 'node:path';
// Spelled with its extension: this module is loaded by Node itself, as a
// dependency of a vite config, and Node's ESM resolver does not guess one.
import { scanSources, statLine } from './source-fingerprint.ts';
import { readStoryCode } from './story-code-read.ts';
import { cachedVirtualModule } from './virtual-cache.ts';

export type { StoryCode, StoryCodes } from './story-code-read.ts';
export { readStoryCode };

export interface StoryCodeOptions {
  tsconfig: string;
  // The checkout the keys are relative to. A bundler globs a story under
  // whatever path it wants; a repository-relative one is what both spellings
  // end with.
  repo: string;
  // Which of the project's files are stories. Defaults to the kit's own.
  include?: (fileName: string) => boolean;
  // Files whose changes should refresh the sources during `vite dev`. Defaults
  // to anything the `include` filter accepts.
  watch?: (fileName: string) => boolean;
}

const DEFAULT_INCLUDE = (fileName: string): boolean =>
  fileName.includes('/packages/ui/src/') && fileName.endsWith('.stories.tsx');

async function fingerprint(
  tsconfig: string,
  include: (fileName: string) => boolean,
): Promise<string> {
  const sources = await scanSources(join(dirname(tsconfig), 'src'), include);
  const lines = await Promise.all(sources.map(statLine));
  return lines.join('\n');
}

/**
 * Serves `virtual:kroma-story-code`: what each story declares about itself -
 * its name, its group, its own `render` and the source of each of its scenes -
 * keyed by repository-relative path.
 *
 * The name and the group are the half a workbench needs BEFORE it loads
 * anything: they are authored in the story file rather than implied by where it
 * sits, so a list of every component costs one small map here instead of
 * executing all of them.
 *
 * Cached on disk against the story files' paths, sizes and mtimes. A story that
 * cannot be read ships nothing rather than failing the build, which is also
 * what every Metro build sees.
 */
export function storyCode(options: StoryCodeOptions): import('vite').Plugin {
  const include = options.include ?? DEFAULT_INCLUDE;
  return cachedVirtualModule({
    id: 'story-code',
    virtual: 'virtual:kroma-story-code',
    binding: 'STORY_CODE',
    version: 2,
    fingerprint: () => fingerprint(options.tsconfig, include),
    read: () =>
      readStoryCode({ tsconfig: options.tsconfig, repo: options.repo, include }).catch(() => ({})),
    watch: options.watch ?? include,
  });
}
