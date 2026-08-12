// The Metro mirror of `config.web.tsx`: a phone or TV has no address bar for
// the router to write to.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench, memoryRouter } from '@kroma/workbench';
import { BuildStamp } from './BuildStamp';
import { SOURCE } from './source';
import { PAGES, STORIES } from './stories';

export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  pages: PAGES,
  router: memoryRouter(),
  source: SOURCE,
  footer: <BuildStamp />,
});
