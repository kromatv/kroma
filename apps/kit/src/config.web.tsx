import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench } from '@kroma/workbench';
import { KitFooter } from './KitFooter';
import { SOURCE } from './source';
import { PAGES, STORIES } from './stories';

export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  pages: PAGES,
  source: SOURCE,
  footer: <KitFooter />,
});
