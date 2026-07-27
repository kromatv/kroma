// The workbench config for Metro — the native half of `workbench.web.tsx`.
//
// @kroma/tv is in the native app's graph (tv-native imports `TvApp` from the barrel,
// and the barrel lazily imports this), so this file has to exist even though only a
// browser shell ever shows it: Metro would otherwise try to transform
// `import.meta.glob` and fail the whole bundle. The kit's usual `.web` split, for the
// usual reason.
//
// Both halves discover the same files, so a story is never in one and missing from
// the other. They differ in the one honest way Metro forces: it cannot hand a module
// its own text, so demo sources and prop docs are absent here rather than stale on
// both.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { type Context, defineWorkbench, discoverMetro, memoryRouter } from '@kroma/workbench';

/** Metro's build-time directory require. Declared locally rather than globally:
 * it exists in the bundler, not in the runtime, and nothing else should reach for
 * it by accident. */
declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): Context;
};

// ONE context, matching both file names: `discoverMetro` tells stories and demos
// apart by their own names.
const STORIES = discoverMetro(require.context('../../ui/src', true, /\.(stories|demo)\.tsx$/));

/** `memoryRouter` because a native target has no address bar to keep in step. */
const Workbench = defineWorkbench({ ...KROMA_WORKBENCH, stories: STORIES, router: memoryRouter() });

export { STORIES, Workbench };
