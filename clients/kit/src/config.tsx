// The workbench config for the NATIVE kit app - the Metro mirror of
// `config.web.tsx`. It differs by one line: a phone or TV has no address bar
// for the router to write to, so `memoryRouter` holds the location in memory.

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
