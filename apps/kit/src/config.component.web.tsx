import { KROMA_WORKBENCH } from '@kromatv/ui/workbench-config';
import { defineWorkbench } from '@kromatv/workbench';
import { KitFooter } from './kit-footer.component';
import { SOURCE } from './source';
import { PAGES, STORIES } from './stories';

export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  pages: PAGES,
  source: SOURCE,
  footer: <KitFooter />,
});
