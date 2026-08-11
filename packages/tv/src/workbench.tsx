// The workbench config for Metro — the native half of `workbench.web.tsx`.
// This file must exist even though only a browser shell ever shows it: Metro
// would otherwise try to transform `import.meta.glob` and fail the whole
// bundle. Both halves discover the same files; this one lacks demo sources and
// prop docs, since Metro cannot hand a module its own text.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { type Context, defineWorkbench, discoverMetro, memoryRouter } from '@kroma/workbench';

// Declared locally, not globally: this exists in the bundler, not the runtime.
declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): Context;
};

const STORIES = discoverMetro(
  require.context('../../ui/src', true, /\.(stories|demo)\.tsx$|\.docs\.mdx$/),
);

// memoryRouter: a native target has no address bar to keep in step.
const Workbench = defineWorkbench({ ...KROMA_WORKBENCH, stories: STORIES, router: memoryRouter() });

export { STORIES, Workbench };
