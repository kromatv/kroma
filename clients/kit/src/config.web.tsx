import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench } from '@kroma/workbench';
import { BuildStamp } from './BuildStamp';
import { STORIES } from './stories';

export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  footer: <BuildStamp />,
});
