// The source link: the code behind the story on the canvas, at the revision the
// workbench was built from - and, where the build could read one, the history
// that got it there.

import { createContext, type ReactNode, type RefObject, useContext, useMemo, useRef } from 'react';
import type { StoryEntry } from './entry';
import {
  fileUrl,
  type HistoryEntry,
  type HistoryRow,
  type HistorySubject,
  historyOf,
  type KitHistory,
  recentChanges,
} from './history';
import { permalink } from './link';
import { folderOf, repoPath } from './repo-path';
import type { Navigate, WorkbenchRouter } from './router';

/** An article the source link can name a file for. The workbench hands the
 * binding its stories, never its pages, so a host that wants a page linked
 * passes the same list it gave the shell. */
interface PageRef {
  id: string;
  title: string;
  group: string;
  path: string;
}

/** Where a host's code is published, the revision this build came from, and
 * what git said about it at build time. `root` is the repo-relative directory
 * the discovered files live under: a path that already contains it is cut
 * there, one relative to it is joined onto it. Every git-derived field is
 * nullable, because a build made outside a checkout still runs - it just has
 * nothing to link to. */
interface StorySource {
  repository: string | null;
  commit: string | null;
  dirty: boolean;
  root: string;
  pages?: readonly PageRef[];
  history?: KitHistory;
}

/** A link to the open story's code, and whether the tree it was built from had
 * uncommitted changes the link cannot show. */
interface SourceLink {
  href: string;
  dirty: boolean;
}

/** What an open thing says about itself: where its code is published, and what
 * git knows about it. Either half can be missing on its own. */
interface Provenance {
  href: string | null;
  entry?: HistoryEntry;
  repository: string | null;
}

/** The permalink to the folder a story's file sits in - component, stories,
 * demos and tests together - pinned to the commit this build was made from. */
function sourceUrl(source: StorySource, path: string | undefined): string | null {
  const { repository, commit, root } = source;
  return path ? permalink(repository, 'tree', commit, folderOf(repoPath(root, path))) : null;
}

interface SourceBinding {
  source: StorySource;
  stories: readonly StoryEntry[];
  showing: RefObject<string | undefined>;
  go: RefObject<Navigate | undefined>;
}

const SourceContext = createContext<SourceBinding | null>(null);

/** Ties the source link to the router: hand the workbench the `router` this
 * returns and wrap it in the provider with the `binding`, and the toolbar's
 * link follows whatever story the canvas is showing - on a memory router as
 * much as on an address bar. */
function useSourceLink(
  source: StorySource | undefined,
  stories: readonly StoryEntry[],
  router: WorkbenchRouter,
): { router: WorkbenchRouter; binding: SourceBinding | null } {
  const showing = useRef<string | undefined>(undefined);
  const go = useRef<Navigate | undefined>(undefined);
  return useMemo(() => {
    if (!source) return { router, binding: null };
    const paths = new Map(stories.map((story) => [story.id, story.path]));
    const first = stories[0]?.id ?? '';
    // The workbench calls the router at the top of its own render, before the
    // toolbar that reads this, so the path is never a navigation behind.
    const routed: WorkbenchRouter = () => {
      const at = router();
      const [where, navigate] = at;
      showing.current = paths.get(where.story ?? first);
      go.current = navigate;
      return at;
    };
    return { router: routed, binding: { source, stories, showing, go } };
  }, [source, stories, router]);
}

/** Publishes the source link to the toolbar and the article. */
function SourceProvider({
  binding,
  children,
}: Readonly<{ binding: SourceBinding | null; children: ReactNode }>) {
  return <SourceContext.Provider value={binding}>{children}</SourceContext.Provider>;
}

/** The link to the open story's source, or null when the host never said where
 * its code lives or the build cannot name the revision it holds. */
function useStorySource(): SourceLink | null {
  const binding = useContext(SourceContext);
  if (!binding) return null;
  const href = sourceUrl(binding.source, binding.showing.current);
  return href ? { href, dirty: binding.source.dirty } : null;
}

/** What git knows about the open story, or null where the build read nothing. */
function useStoryHistory(): Provenance | null {
  const binding = useContext(SourceContext);
  if (!binding) return null;
  const { source, showing } = binding;
  const entry = historyOf(source.history, source.root, showing.current);
  if (!entry) return null;
  return { href: sourceUrl(source, showing.current), entry, repository: source.repository };
}

/** One discovered FILE's own link and history - what an article is, where a
 * story is a whole folder. */
function usePathSource(path: string | undefined): Provenance | null {
  const binding = useContext(SourceContext);
  if (!(binding && path)) return null;
  const { source } = binding;
  const href = fileUrl(source.repository, source.commit, source.root, path);
  const entry = historyOf(source.history, source.root, path);
  if (!(href || entry)) return null;
  return { href, entry, repository: source.repository };
}

function subjectsOf(binding: SourceBinding): HistorySubject[] {
  const stories = binding.stories.map((story) => ({
    id: story.id,
    name: story.name,
    group: story.group,
    page: false,
    path: story.path,
  }));
  const pages = (binding.source.pages ?? []).map((page) => ({
    id: page.id,
    name: page.title,
    group: page.group,
    page: true,
    path: page.path,
  }));
  return [...stories, ...pages];
}

/** Everything the build read, most recently changed first, with the means to
 * open one. Null off a host that passed a source, and empty where git had
 * nothing to say - a television, or a shallow clone. */
function useKitHistory(): {
  rows: readonly HistoryRow[];
  shallow: boolean;
  repository: string | null;
  open: (row: HistoryRow) => void;
} | null {
  const binding = useContext(SourceContext);
  const rows = useMemo(
    () =>
      binding
        ? recentChanges(binding.source.history, binding.source.root, subjectsOf(binding))
        : [],
    [binding],
  );
  if (!binding) return null;
  return {
    rows,
    shallow: binding.source.history?.shallow ?? false,
    repository: binding.source.repository,
    open: (row) => binding.go.current?.(row.page ? { page: row.id } : { story: row.id }),
  };
}

export type { PageRef, StorySource };
export {
  SourceProvider,
  sourceUrl,
  useKitHistory,
  usePathSource,
  useSourceLink,
  useStoryHistory,
  useStorySource,
};
