// The routing PORT, and the two adapters that need no dependency to implement it.
//
// The workbench has to run in four places that disagree about what a URL even
// is: a standalone site that owns the address bar, a TV shell squatting on
// someone else's page behind `?workbench`, an Apple TV with no address bar at
// all, and a phone screen mounted INSIDE another router that already owns the
// history. A package that picked one of those and called it routing would be
// broken in the other three - and one that sniffed the environment to guess
// between them would be broken wherever the sniff came out wrong.
//
// So it does neither. The shell states what it needs - tell me where I am, take
// me somewhere - and the host plugs in something that can do it. Everything else
// about routing (whether there is history, what the path means, whether the
// address bar is even ours to write) stops being this package's business.
//
//   pathRouter          the default. REAL PATHS - `/story/button/matrix` - on the
//                       History API alone, no router dependency. Degrades to
//                       plain state where there is no DOM.
//   memoryRouter        never touches the address bar. For a mount nested inside
//                       a host router, for native, and for tests.
//   tanstackRouter      see ./tanstack. Real paths too, but through the HOST's
//                       router rather than a second one, so there is only ever
//                       one in the tree.
//   searchParamsRouter  `?story=&view=`. For a shell that CANNOT do path
//                       routing - a TV app loaded from the filesystem, where
//                       there is no server to fall back to index.html and a
//                       reload of `/story/button` is a 404.
//
// The port is ONE HOOK returning a tuple, deliberately shaped like `useState`:
// an adapter is then an ordinary custom hook, obeying the ordinary rules, and
// there is no lifecycle to explain. A host with an idea of its own - a state
// machine, a query string it already owns, a native deep-link scheme - writes
// about fifteen lines and plugs that in instead.

import { webWindow } from '@kroma/ui/kit';
import { useCallback, useEffect, useRef, useState } from 'react';

/** What the canvas is showing: the live component, the derived variant matrix,
 * one of the story's hand-written scenes, or one of its demos. */
type View = 'preview' | 'matrix' | `scene:${number}` | `demo:${number}`;

/**
 * The whole of the workbench's navigable state.
 *
 * Deliberately three fields. Which frame, which surface, whether the inspector
 * is open - those are how you are LOOKING at a story, not which story you are
 * looking at, and putting them in the location would mean every chip press wrote
 * to the host's history.
 */
interface WorkbenchLocation {
  /** The open story's id. Absent means "whichever is first". */
  story?: string;
  /** Which tab of it. Absent means the live preview. */
  view?: View;
  /**
   * Chrome off: the component and nothing else, for a screenshot runner. Read at
   * mount and never navigated to, which is why no adapter has to write it.
   */
  shot?: boolean;
}

/** Where to go, and whether it is worth a history entry. Flipping to the matrix
 * tab is not a page you should be able to press Back out of, so `replace`
 * defaults to true and a host has to ask for otherwise. */
type Navigate = (next: WorkbenchLocation, options?: { replace?: boolean }) => void;

/**
 * The port: a hook giving the current location and a way to leave it.
 *
 * Read is a HOOK rather than a function because it has to subscribe: a host
 * whose router changes the story from outside - a browser Back, a link in its
 * own UI - must re-render the workbench, and only a hook can make that happen.
 */
type WorkbenchRouter = () => readonly [WorkbenchLocation, Navigate];

/**
 * A view name, from whatever arrived as a string.
 *
 * Exported because every adapter needs it: a location coming from outside is
 * text, and `'scene:2'` has to become the typed thing before it reaches the
 * canvas.
 */
function parseView(raw: string | null | undefined): View | undefined {
  if (!raw) return undefined;
  if (raw === 'matrix' || raw === 'preview') return raw;
  // A bare number was the older spelling of a scene index. Links to a scene end
  // up in review comments and commit messages, so they keep working.
  if (/^\d+$/.test(raw)) return `scene:${Number(raw)}`;
  // Two separators, because a view is spelled twice: `scene:1` in a search param,
  // where a colon is unremarkable, and `scene-1` in a PATH SEGMENT, where it
  // reads as a URL someone could have typed. Both parse, so a link written either
  // way opens the same tab.
  const at = /^(scene|demo)[:-](\d+)$/.exec(raw);
  return at ? (`${at[1]}:${Number(at[2])}` as View) : undefined;
}

/**
 * A view as a PATH SEGMENT, or null when it is the default and should be absent.
 *
 * The mirror of `parseView`, for adapters that put the view in the path rather
 * than in the query: `/story/button/scene-1` instead of `?view=scene:1`. Dashes
 * because a path is something a person reads and sometimes types.
 */
function viewPath(view: View | undefined): string | null {
  if (!view || view === 'preview') return null;
  return view.replace(':', '-');
}

/**
 * Routing that stays in memory. Never reads or writes an address bar.
 *
 * The right adapter wherever the workbench is a GUEST: a screen inside a host
 * router (Expo Router on the phone), a native app with no URL, a test. It is
 * also the safe answer for anything unsure - losing deep links is a far smaller
 * failure than two routers writing one history.
 *
 * `start` seeds it, so a native deep link that DOES carry a story can still open
 * on one without this adapter having to know what a URL is.
 */
function memoryRouter(start: WorkbenchLocation = {}): WorkbenchRouter {
  return function useMemoryRoute() {
    const [at, setAt] = useState(start);
    const go = useCallback<Navigate>((next) => setAt((prev) => ({ ...prev, ...next })), []);
    return [at, go] as const;
  };
}

/**
 * The `?story=&view=` contract, on whatever path the host already sits at.
 *
 * What the workbench has always done, lifted behind the port unchanged:
 * `?workbench&story=button&view=matrix` still opens the matrix, the older bare
 * `?view=2` spelling of a scene still works, and `?shot` still strips the
 * chrome. Links in review comments keep working, and so does the screenshot
 * runner.
 *
 * The PATH is never touched, which is what lets a TV shell keep its own routing
 * and open the workbench over the top of it. `replaceState` rather than
 * `pushState`, because flipping a variant is not a page.
 *
 * Where there is no DOM it degrades to memory instead of throwing, so the same
 * adapter can be the default on every target.
 */
function searchParamsRouter(): WorkbenchRouter {
  return function useSearchParamsRoute() {
    // Read ONCE, lazily. The workbench is the only writer of these params, and
    // it writes with `replaceState`, which fires no event - so re-reading every
    // render would spend a URL parse to learn what this state already knows. A
    // host that navigates from outside wants the TanStack adapter, which
    // subscribes properly.
    const [at, setAt] = useState(read);
    const go = useCallback<Navigate>((next) => {
      setAt((prev) => ({ ...prev, ...next }));
      write(next);
    }, []);
    return [at, go] as const;
  };
}

/**
 * REAL PATHS, on the History API alone.
 *
 * `/story/button`, `/story/button/matrix`, `/story/poster-card/scene-1` - a link
 * you can read, type and shorten, with no router dependency and no query string.
 * This is the default, because a query string is a place to put state that has
 * nowhere better to go, and a story does have somewhere better.
 *
 * `base` is the path the workbench is mounted AT, so a site served from a
 * sub-directory keeps working: everything before it is left alone, everything
 * after it is ours. It needs a server that falls back to index.html for unknown
 * paths - which is every dev server and every static host worth using, but NOT a
 * TV app loaded from the filesystem. Those want `searchParamsRouter`.
 *
 * `pushState` for a new story (it IS a page, and Back should return to the last
 * one) and `replaceState` for a tab within it (flipping to the matrix is not).
 * A `popstate` listener is what makes the browser's own Back work at all.
 */
function pathRouter({ base = '/' }: { base?: string } = {}): WorkbenchRouter {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return function usePathRoute() {
    const [at, setAt] = useState(() => readPath(prefix));
    // The browser's Back and Forward. Without this the address bar would change
    // and the canvas would not, which is worse than having no history at all.
    useEffect(() => {
      const win = webWindow();
      if (!win) return;
      const onPop = () => setAt(readPath(prefix));
      win.addEventListener('popstate', onPop);
      return () => win.removeEventListener('popstate', onPop);
    }, []);
    // The current location, for `go` to merge onto. A REF rather than the state
    // updater's `prev`, because writing the address bar is a SIDE EFFECT and an
    // updater must be pure: React re-invokes updaters (StrictMode does it on
    // every commit in development, and it may discard and replay a render at
    // any time), so the push ran twice and every story landed on the history
    // stack as a duplicate that took two Back presses to leave.
    const atRef = useRef(at);
    atRef.current = at;
    const go = useCallback<Navigate>((next, options) => {
      const merged = { ...atRef.current, ...next };
      // A new STORY is a page; a new view of the same one is not - and neither
      // is re-selecting the story already open, which otherwise pushed a
      // duplicate entry. `replace` overrides it either way.
      const sameStory = next.story === undefined || next.story === atRef.current.story;
      const replace = options?.replace ?? sameStory;
      writePath(prefix, merged, replace);
      setAt(merged);
    }, []);
    return [at, go] as const;
  };
}

/**
 * `/story/button/matrix` -> `{ story: 'button', view: 'matrix' }`.
 *
 * The SEARCH is still read as a fallback, and that is not nostalgia. Two callers
 * can only address a story that way: the screenshot runner, which drives
 * `?shot&story=<id>` because it has no server to rehydrate a path with, and every
 * `?story=` link already written into a review comment. The path wins where both
 * are present, so a real navigation is never overruled by a stale query.
 */
function readPath(prefix: string): WorkbenchLocation {
  const win = webWindow();
  if (!win) return {};
  const { pathname, search } = win.location;
  const params = new URLSearchParams(search);
  // `shot` is only ever in the search, on every adapter: it is a runner's FLAG,
  // not a place you navigate to, and giving a flag a route would mean the
  // runner's URLs and a reader's URLs had different shapes.
  const shot = params.has('shot');
  const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
  const [head, story, view] = rest.split('/');
  if (head === 'story' && story) {
    return { story: decodeURIComponent(story), view: parseView(view), shot };
  }
  // Not a path we wrote: fall back to the query string, which is exactly what
  // the search-param adapter reads. Same rule, one implementation.
  return read();
}

/** Put a location on the path, keeping the search - `?shot` above all - intact. */
function writePath(prefix: string, at: WorkbenchLocation, replace: boolean): void {
  const win = webWindow();
  if (!win?.history || !at.story) return;
  const view = viewPath(at.view);
  const suffix = view ? `/${view}` : '';
  const path = `${prefix}story/${encodeURIComponent(at.story)}${suffix}`;
  const url = `${path}${win.location.search}`;
  if (replace) win.history.replaceState(null, '', url);
  else win.history.pushState(null, '', url);
}

/** The location the address bar is currently describing. Empty off the web. */
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

/**
 * Put a location into the address bar, keeping every param that is not ours -
 * `?workbench` above all, which is how the TV shells decide to show this at all.
 *
 * Partial by design: the shell navigates with `{story, view}` when it opens a
 * component and with `{view}` alone when it changes tab, and a field that is not
 * mentioned is left exactly as it was.
 */
function write(next: WorkbenchLocation): void {
  const win = webWindow();
  if (!win?.history) return;
  const params = new URLSearchParams(win.location.search);
  params.set('workbench', '');
  if (next.story) params.set('story', next.story);
  // `preview` is the default, so it is spelled by being ABSENT: the tidiest URL
  // should be the one for the state you are in nine times out of ten.
  if (next.view === 'preview') params.delete('view');
  else if (next.view) params.set('view', String(next.view));
  win.history.replaceState(null, '', `${win.location.pathname}?${params}`);
}

export type { Navigate, View, WorkbenchLocation, WorkbenchRouter };
export { memoryRouter, parseView, pathRouter, searchParamsRouter, viewPath };
