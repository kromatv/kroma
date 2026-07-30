// Where the stories are, Vite's half - the web mirror of `stories.ts`.
//
// Lives HERE rather than in @kroma/workbench: `import.meta.glob` is a
// compile-time transform resolved relative to the file that writes it, and
// the package is generic, so it can't glob one design system's tree itself.
// `#ui` is the kit's own alias; a glob pattern resolves aliases, so moving
// either end breaks nothing.
//
// The pattern and options are written out in full at each call site because
// `import.meta.glob` is matched and replaced TEXTUALLY - a constant for
// either one silently stops being a glob.
//
// `sources` globs only the demos, not every component, to keep their text out
// of the bundle. `PROPS` comes from TypeScript's own checker at build time
// (see `propDocs` in clients/tv-build), so `extends BoxProps` is followed.

import { PROPS } from 'virtual:kroma-props';
import { discoverVite } from '@kroma/workbench';

export const STORIES = discoverVite(
  import.meta.glob('#ui/**/*.{stories,demo}.tsx', { eager: true }),
  import.meta.glob('#ui/**/*.demo.tsx', { eager: true, query: '?raw', import: 'default' }),
  PROPS,
);
