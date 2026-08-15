// The Vite mirror of `stories.ts`. `import.meta.glob` is a compile-time
// transform resolved relative to the file that writes it, and it is matched
// TEXTUALLY: a constant for the pattern or the options stops being a glob.
//
// No `eager` on the story globs, which is the whole point: each one yields a
// loader per file, so a component's module, its demos and its prose are fetched
// when a reader opens it rather than shipped in the entry chunk. What the
// sidebar needs up front - every name, every section - comes from
// `virtual:kroma-story-code`, which the build already reads out of the story
// files. The prop docs are the largest thing the build emits and no list wants
// them, so they are behind a dynamic import and arrive with the first story.
//
// The pages stay eager: an article's own title, summary and width are ordinary
// ESM exports of the `.page.mdx`, and there are seven of them.

import { STORY_CODE } from 'virtual:kroma-story-code';
import { discoverPagesVite, indexVite, withPageHistory } from '@kroma/workbench';

export const STORIES = indexVite({
  modules: import.meta.glob('#ui/**/*.{story.mdx,demo.tsx}'),
  sources: import.meta.glob<string>('#ui/**/*.demo.tsx', { query: '?raw', import: 'default' }),
  codes: STORY_CODE,
  props: () => import('virtual:kroma-props').then((module) => module.PROPS),
});

// The guides are the SITE's, not the kit's: they are writing about the design
// system rather than part of it, so they live here and glob from here.
export const PAGES = withPageHistory(
  discoverPagesVite(import.meta.glob('./guides/*.page.mdx', { eager: true })),
);
