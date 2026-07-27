// Where the stories are, Metro's half — the native mirror of `stories.web.ts`.
//
// Same registry, found the way the other bundler can find it. Vite has
// `import.meta.glob`; Metro has `require.context`, and neither understands the
// other's spelling, so this is the kit's usual `.web` split for the usual reason.
// ONE context matching both file names: `discoverMetro` tells stories and demos
// apart by their own names.
//
// The one honest difference, and it is Metro's rather than a shortcut: it cannot
// hand a module its own text. So there is no `?raw` half here, which means a demo
// renders without its code panel and the Props tab is empty - rather than either
// of them carrying a hand-written copy that has quietly drifted from the file it
// claims to be.

import { discoverMetro } from '@kroma/workbench';

/** Metro's build-time directory require. Declared locally rather than globally:
 * it exists in the bundler, not in the runtime, and nothing else should reach for
 * it by accident. */
declare const require: {
  context(
    directory: string,
    useSubdirectories: boolean,
    regExp: RegExp,
  ): { keys(): string[]; <T>(id: string): T };
};

export const STORIES = discoverMetro(
  require.context('../../../packages/ui/src', true, /\.(stories|demo)\.tsx$/),
);
