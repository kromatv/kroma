// The Metro mirror of `config.web.tsx`: a phone or TV has no address bar for
// the router to write to.

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
