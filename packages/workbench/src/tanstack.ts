// The TanStack Router adapter: real routes, not a query string.
//
// It does NOT create a router. That is the entire point of it, and the reason
// this file is short: a workbench that stood up its own router would be a second
// router in a tree that usually already has one, and two routers writing one
// history is the bug that makes Back go somewhere neither of them meant. So this
// consumes the host's - the same instance its own screens navigate with.
//
// What it gives you over the default `searchParamsRouter` is a real URL:
//
//   /story/button                 the live preview
//   /story/button/matrix          its variant matrix
//   /story/poster-card/scene-1    its second hand-written scene
//   /story/button/demo-0          its first worked example
//
// which is a link you can read, type and shorten, and which participates in the
// host's route tree like any other page - lazy loading, pending components,
// breadcrumbs, `<Link>`. The dash spelling is deliberate: `scene:1` is fine in a
// search param and ugly in a path, so `viewPath` writes the dash and `parseView`
// accepts both, meaning a link written either way still opens the same tab.
//
// Because `useParams` SUBSCRIBES, a browser Back - or a `<Link>` elsewhere in the
// host's own UI - moves the canvas. That is the one thing the plain adapter
// cannot do.
//
// Imported from a subpath (`@kroma/workbench/tanstack`) rather than the barrel, so
// a native build - which has no router and no use for one - never pulls
// @tanstack/react-router into its bundle to find out it was not needed.
//
//
// Two routes, because the view segment is optional and TanStack does not have
// optional params:
//
//   createRoute({ path: '/story/$storyId',        component: WorkbenchPage })
//   createRoute({ path: '/story/$storyId/$view',  component: WorkbenchPage })
//
// ...both rendering the configured workbench. `?shot` is still read from the
// search, because it is a screenshot runner's flag rather than a place you
// navigate to, so nothing has to validate it.

import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import type { Navigate, WorkbenchLocation, WorkbenchRouter } from './router';
import { parseView, viewPath } from './view';

interface TanstackOptions {
  // The route holding just a story, used when the view is the default preview. Must carry a
  // `$storyId` param.
  storyRoute?: string;
  // The route holding a story AND a view. Must carry `$storyId` and `$view`. Navigated to for
  // every tab that is not the preview.
  viewRoute?: string;
}

// Route the workbench through the router the host already has, on real paths. const router =
// useMemo(() => tanstackRouter(), []); defineWorkbench({ stories: STORIES, router }); `strict:
// false` on the reads is what lets one adapter serve both routes - and lets it be mounted under
// a route tree this package knows nothing about.
function tanstackRouter({
  storyRoute = '/story/$storyId',
  viewRoute = '/story/$storyId/$view',
}: TanstackOptions = {}): WorkbenchRouter {
  return function useTanstackRoute() {
    // Loose reads: this adapter does not know which of the two routes matched,
    // and it does not need to - the params say everything.
    const params = useParams({ strict: false }) as Record<string, unknown>;
    const search = useSearch({ strict: false }) as Record<string, unknown>;
    const navigate = useNavigate();

    const at = useMemo<WorkbenchLocation>(
      () => ({
        story: typeof params.storyId === 'string' ? params.storyId : undefined,
        view: parseView(typeof params.view === 'string' ? params.view : undefined),
        // A flag, not a destination: it belongs in the search whichever adapter
        // is in use, and no route has to validate it.
        shot: 'shot' in search,
      }),
      [params, search],
    );

    const go = useCallback<Navigate>(
      (next, options) => {
        // A partial navigation - the shell changes tab without restating the
        // story - still has to produce a whole path, so the current values fill
        // the gaps.
        const story = next.story ?? at.story;
        if (!story) return;
        const view = viewPath(next.view ?? at.view);
        // `preview` is spelled by being ABSENT, which is what makes the shortest
        // URL the one for the state you are in nine times out of ten - and why
        // there are two routes rather than one with a placeholder segment.
        navigate({
          to: view ? viewRoute : storyRoute,
          params: view ? { storyId: story, view } : { storyId: story },
          // Flipping to the matrix tab is not a page you should be able to press
          // Back out of; opening a different component is.
          replace: options?.replace ?? next.story === undefined,
        });
      },
      // The two route strings are closed over from `tanstackRouter`'s arguments,
      // not from a render, so they are constants here rather than dependencies.
      [navigate, at.story, at.view],
    );

    return [at, go] as const;
  };
}

export type { TanstackOptions };
export { tanstackRouter };
