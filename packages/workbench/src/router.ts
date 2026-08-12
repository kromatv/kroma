// The routing port the workbench shell navigates through, and the adapters that
// implement it without a router dependency.

import { webWindow } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';

type View = 'preview' | 'matrix' | `scene:${number}` | `demo:${number}`;

interface WorkbenchLocation {
  story?: string;
  view?: View;
  /** An article, addressed on its own. A page and a story are never both open. */
  page?: string;
  /** A section of the open article, by its slug. Written as the fragment, so a
   *  link to one is a link anyone can paste. */
  section?: string;
  shot?: boolean;
}

// `replace` defaults to true: a tab change is not a page to press Back out of.
type Navigate = (next: WorkbenchLocation, options?: { replace?: boolean }) => void;

// A hook rather than a function, so a host that navigates from outside can re-render the
// workbench.
type WorkbenchRouter = () => readonly [WorkbenchLocation, Navigate];

function parseView(raw: string | null | undefined): View | undefined {
  if (!raw) return undefined;
  if (raw === 'matrix' || raw === 'preview') return raw;
  // A bare number is the legacy spelling of a scene index; old links keep working.
  if (/^\d+$/.test(raw)) return `scene:${Number(raw)}`;
  // Both separators parse: `scene:1` in a search param, `scene-1` in a path segment.
  const at = /^(scene|demo)[:-](\d+)$/.exec(raw);
  return at ? (`${at[1]}:${Number(at[2])}` as View) : undefined;
}

// A view as a path segment (`scene-1`), or null when it is the default and should be absent
// from the URL.
function viewPath(view: View | undefined): string | null {
  if (!view || view === 'preview') return null;
  return view.replace(':', '-');
}

// An article and a story are two addresses, not two fields of one: opening
// either drops the other, so no caller has to remember to clear it.
function merge(prev: WorkbenchLocation, next: WorkbenchLocation): WorkbenchLocation {
  const at = { ...prev, ...next };
  if (next.story !== undefined) return { ...at, page: undefined, section: undefined };
  // A section belongs to the article it is in, so moving to another page drops
  // it unless the caller named one in the same breath.
  if (next.page !== undefined && next.page !== prev.page) {
    return { ...at, story: undefined, view: undefined, section: next.section };
  }
  return at;
}

// Routing that stays in memory, never reading or writing an address bar: the adapter for a
// mount nested in a host router, for native, and for tests.
function memoryRouter(start: WorkbenchLocation = {}): WorkbenchRouter {
  return function useMemoryRoute() {
    const [at, setAt] = useState(start);
    const go = useCallback<Navigate>((next) => setAt((prev) => merge(prev, next)), []);
    return [at, go] as const;
  };
}

// The `?story=&view=` contract, on whatever path the host already sits at. The path is never
// touched, so a TV shell can keep its own routing and open the workbench over the top of it;
// off the web it degrades to memory.
function searchParamsRouter(): WorkbenchRouter {
  return function useSearchParamsRoute() {
    // Read once: the workbench is the only writer of these params and writes with
    // `replaceState`, which fires no event, so there is nothing to subscribe to.
    const [at, setAt] = useState(read);
    const go = useCallback<Navigate>((next) => {
      setAt((prev) => merge(prev, next));
      write(next);
    }, []);
    return [at, go] as const;
  };
}

// Real paths (`/story/button/matrix`) on the History API alone, mounted at `base`. Needs a
// server that falls back to index.html for unknown paths; a TV app loaded from the filesystem
// wants `searchParamsRouter` instead.
function pathRouter({ base = '/' }: { base?: string } = {}): WorkbenchRouter {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return function usePathRoute() {
    const [at, setAt] = useState(() => readPath(prefix));
    useEffect(() => {
      const win = webWindow();
      if (!win) return;
      const onPop = () => setAt(readPath(prefix));
      win.addEventListener('popstate', onPop);
      return () => win.removeEventListener('popstate', onPop);
    }, []);
    // A ref rather than the updater's `prev`: writing history is a side effect and
    // React re-invokes updaters (StrictMode), which pushed every story twice.
    const atRef = useRef(at);
    atRef.current = at;
    const go = useCallback<Navigate>((next, options) => {
      const merged = merge(atRef.current, next);
      // A new story is a page; a new view of the same one is not, and neither is
      // re-selecting the story already open.
      const sameStory = next.story === undefined || next.story === atRef.current.story;
      const replace = options?.replace ?? sameStory;
      writePath(prefix, merged, replace);
      setAt(merged);
    }, []);
    return [at, go] as const;
  };
}

function readPath(prefix: string): WorkbenchLocation {
  const win = webWindow();
  if (!win) return {};
  const { pathname, search } = win.location;
  const params = new URLSearchParams(search);
  const shot = params.has('shot');
  const section = decodeURIComponent(win.location.hash.replace(/^#/, '')) || undefined;
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  const segments = rest.split('/').filter(Boolean);
  const [head, name, view] = segments;
  if (head === 'story' && name) {
    return { story: decodeURIComponent(name), view: parseView(view), shot };
  }
  // An article sits at the root - `/icons`, not `/page/icons` - so it is the
  // ONE segment that is not `story`. Two segments were written by something
  // else, and a `?story=` means the query is the address, not the path;
  // reading either as a page id would swallow the fallback below.
  if (segments.length === 1 && head && head !== 'story' && !params.has('story')) {
    return { page: decodeURIComponent(head), section, shot };
  }
  // Not a path we wrote: the screenshot runner and older links address a story
  // through `?story=`, so fall back to the query string.
  return read();
}

function writePath(prefix: string, at: WorkbenchLocation, replace: boolean): void {
  const win = webWindow();
  if (!win?.history) return;
  if (at.page) {
    const fragment = at.section ? `#${encodeURIComponent(at.section)}` : '';
    const url = `${prefix}${encodeURIComponent(at.page)}${win.location.search}${fragment}`;
    if (replace) win.history.replaceState(null, '', url);
    else win.history.pushState(null, '', url);
    return;
  }
  if (!at.story) return;
  const view = viewPath(at.view);
  const suffix = view ? `/${view}` : '';
  const path = `${prefix}story/${encodeURIComponent(at.story)}${suffix}`;
  const url = `${path}${win.location.search}`;
  if (replace) win.history.replaceState(null, '', url);
  else win.history.pushState(null, '', url);
}

function read(): WorkbenchLocation {
  const win = webWindow();
  if (!win) return {};
  const params = new URLSearchParams(win.location.search);
  return {
    story: params.get('story') ?? undefined,
    view: parseView(params.get('view')),
    shot: params.has('shot'),
  };
}

// Params that are not ours are kept, `?workbench` above all: it is how the TV
// shells decide to show the workbench at all.
function write(next: WorkbenchLocation): void {
  const win = webWindow();
  if (!win?.history) return;
  const params = new URLSearchParams(win.location.search);
  params.set('workbench', '');
  if (next.story) params.set('story', next.story);
  if (next.view === 'preview') params.delete('view');
  else if (next.view) params.set('view', String(next.view));
  win.history.replaceState(null, '', `${win.location.pathname}?${params}`);
}

export type { Navigate, View, WorkbenchLocation, WorkbenchRouter };
export { memoryRouter, parseView, pathRouter, searchParamsRouter, viewPath };
