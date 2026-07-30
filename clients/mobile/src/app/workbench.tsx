// The design system's workbench on the phone. Not linked from any screen: reach
// it at `/workbench` (deep link `kroma://workbench`).
// `memoryRouter` is explicit: Expo Router already owns navigation history, and
// two routers writing one history send Back somewhere neither of them meant.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { type Context, defineWorkbench, discoverMetro, memoryRouter } from '@kroma/workbench';

// Metro's build-time directory require, declared locally: it exists in the
// bundler, not in the runtime.
declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): Context;
};

const STORIES = discoverMetro(
  require.context('../../../../packages/ui/src', true, /\.(stories|demo)\.tsx$/),
);

export default defineWorkbench({ ...KROMA_WORKBENCH, stories: STORIES, router: memoryRouter() });
