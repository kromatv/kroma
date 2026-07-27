// Where the stories are, Vite's half - the web mirror of `stories.ts`.
//
// Two globs and a virtual module, and each has to be HERE rather than in
// @kroma/workbench: `import.meta.glob` is a compile-time transform resolved
// relative to the file that writes it, and the package is generic - it would be
// globbing its own directory, and it has no business naming one design system's
// tree. That is the whole reason the workbench takes its stories as a prop.
//
// `#ui` is the kit's own alias, and a glob pattern RESOLVES aliases - so this
// file does not count `../` from itself to another package, and moving either
// end breaks nothing.
//
//   modules  every story and demo, as components.
//   sources  the DEMOS as text, which is what gives a demo its code panel. Only
//            the demos: this used to glob every component in the kit so a regex
//            parser could read prop docs out of them in the browser, which
//            inlined about half a megabyte of source into the bundle for a panel
//            that shows one component at a time. 6KB now.
//   PROPS    the prop docs, read by TypeScript's own checker at BUILD time (see
//            `propDocs` in clients/tv-build). Data, not text - so nothing is
//            parsed at runtime and `extends BoxProps` is actually followed.
//
// The pattern and the options are written out in full at each call site:
// `import.meta.glob` is matched and replaced TEXTUALLY, so a constant for either
// one silently stops being a glob. Verbose, and not negotiable.
//
// Everything that happens to the result - levelling by folder, ordering,
// attaching demos - is `discoverVite`, in the package. Nothing is listed and
// nothing is registered: drop a `*.stories.tsx` beside a component and it
// appears.

import { PROPS } from 'virtual:kroma-props';
import { discoverVite } from '@kroma/workbench';

export const STORIES = discoverVite(
  import.meta.glob('#ui/**/*.{stories,demo}.tsx', { eager: true }),
  import.meta.glob('#ui/**/*.demo.tsx', { eager: true, query: '?raw', import: 'default' }),
  PROPS,
);
