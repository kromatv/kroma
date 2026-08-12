import type { StorySource } from '@kroma/workbench';
import { BUILD } from './buildInfo';
import { HISTORY } from './kitHistory';
import { PAGES } from './stories';

/** The kit's stories are @kroma/ui's own files, and the link to one is pinned to
 * the revision this build was made from. The articles come along because the
 * workbench is handed its stories but never its pages, and an article's file is
 * what a link to one has to name. */
export const SOURCE: StorySource = {
  repository: BUILD.repository,
  commit: BUILD.commitFull,
  dirty: BUILD.dirty,
  root: 'packages/ui/src',
  pages: PAGES,
  history: HISTORY,
};
