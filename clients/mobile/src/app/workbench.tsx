// The design system's workbench, on the phone that actually renders the kit.
//
// Not linked from any screen: navigate to `/workbench` (deep link
// `kroma://workbench`, or type the route in the Expo dev menu). The mobile mirror
// of the browser shells' `?workbench`.
//
// Two things differ from the kit site's config, and both follow from being a
// GUEST rather than a site:
//
//   discovery  `require.context`, Metro's half of the primitive - one context for
//              both file names. Metro cannot hand a module its own text, so demo
//              sources and prop docs are absent here rather than stale - see
//              `discoverMetro`.
//   routing    `memoryRouter`, explicitly. This screen is mounted inside Expo
//              Router, which already owns the history; two routers writing one
//              history is how Back ends up somewhere neither of them meant.
//
// Everything else - the title, the mark, the locale provider - is
// `KROMA_WORKBENCH`, shared with the kit site and the TV shells.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { type Context, defineWorkbench, discoverMetro, memoryRouter } from '@kroma/workbench';

/** Metro's build-time directory require. Declared locally rather than globally:
 * it exists in the bundler, not in the runtime, and nothing else should reach for
 * it by accident. */
declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): Context;
};

const STORIES = discoverMetro(
  require.context('../../../../packages/ui/src', true, /\.(stories|demo)\.tsx$/),
);

export default defineWorkbench({ ...KROMA_WORKBENCH, stories: STORIES, router: memoryRouter() });
