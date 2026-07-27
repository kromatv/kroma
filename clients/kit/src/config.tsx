// The workbench config for the NATIVE kit app — the Metro mirror of
// `config.web.tsx`.
//
// It differs from the web half in exactly one line, and it is the same line the
// TV shells differ by: the ROUTER. A phone or a television has no address bar to
// keep a story in step with, so there is nothing for the default path routing to
// write to and `memoryRouter` holds the location in memory instead.
//
// Everything else - the title, the mark, the locale provider - is
// `KROMA_WORKBENCH`, shared with the site and with the app shells.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench, memoryRouter } from '@kroma/workbench';
import { BuildStamp } from './BuildStamp';
import { STORIES } from './stories';

export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  router: memoryRouter(),
  footer: <BuildStamp />,
});
