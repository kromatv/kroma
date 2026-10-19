import { KROMA_WORKBENCH } from '@kromatv/ui/workbench-config';
import {
  defineWorkbench,
  discoverVite,
  type GlobHost,
  searchParamsRouter,
} from '@kromatv/workbench';

const STORIES = discoverVite(
  (import.meta as unknown as GlobHost).glob('#ui/**/*.{stories.tsx,demo.tsx,docs.mdx}', {
    eager: true,
  }),
  (import.meta as unknown as GlobHost).glob('#ui/**/*.demo.tsx', {
    eager: true,
    query: '?raw',
    import: 'default',
  }),
);

const Workbench = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  router: searchParamsRouter(),
});

export { STORIES, Workbench };
