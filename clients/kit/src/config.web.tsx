// The workbench config: everything KROMA-shaped about this site, and nothing else.
//
// Which is now one line, because "KROMA-shaped" - the title, the mark, the locale
// provider - is `KROMA_WORKBENCH` in @kroma/ui, shared with the two TV shells,
// the phone and this app's own native half. What is left here is the one fact only this site knows: its own
// registry, because a glob resolves relative to the file that writes it.

import { KROMA_WORKBENCH } from '@kroma/ui/workbench-config';
import { defineWorkbench } from '@kroma/workbench';
import { BuildStamp } from './BuildStamp';
import { STORIES } from './stories';

// No router: a site served by a real server gets the default path routing, and
// `/story/button` is an address someone can paste into a review.
//
// The stamp is a host's job, not `KROMA_WORKBENCH`'s: it is this BUILD's
// identity, and the shared payload is the same object in five bundles.
export const Kit = defineWorkbench({
  ...KROMA_WORKBENCH,
  stories: STORIES,
  footer: <BuildStamp />,
});
