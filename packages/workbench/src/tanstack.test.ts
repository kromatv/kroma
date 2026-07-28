// @vitest-environment jsdom
//
// The TanStack Router adapter for the workbench.
//
// What it does NOT do is the point of it: it never creates a router. A workbench
// that stood up its own would be a second router in a tree that already has one,
// and two routers writing one history is the bug that makes Back go somewhere
// neither of them meant. So it consumes the host's.
//
// The rest is a URL a person can read, type and shorten, which puts three rules
// on the path spelling:
//
//   - `preview` is spelled by being ABSENT, which is why there are two routes
//     rather than one with a placeholder segment. The shortest url is the state
//     you are in nine times out of ten.
//   - A view is written with a DASH in a path and a colon in a search param, and
//     both parse - so a `scene:1` link pasted from a review comment and a
//     `scene-1` link typed into the bar open the same tab.
//   - A partial navigation still has to produce a whole path: the shell flips a
//     tab without restating the story, so the current location fills the gaps.
//
// And one rule about history: flipping to the matrix tab is not a page you
// should be able to press Back out of, but opening a different component is.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  search: {} as Record<string, unknown>,
}));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@tanstack/react-router', () => ({
  useParams: () => route.params,
  useSearch: () => route.search,
  useNavigate: () => navigate,
}));

import { tanstackRouter } from './tanstack';

/** Mount the adapter at a given location, and hand back what it reports. */
function at(params: Record<string, unknown> = {}, search: Record<string, unknown> = {}) {
  route.params = params;
  route.search = search;
  const useRoute = tanstackRouter();
  const { result } = renderHook(() => useRoute());
  return result;
}

/** The single navigation the adapter performed. */
function went() {
  const call = navigate.mock.calls[0]?.[0];
  if (!call) throw new Error('the adapter never navigated');
  return call as { to: string; params: Record<string, string>; replace: boolean };
}

beforeEach(() => {
  route.params = {};
  route.search = {};
  vi.clearAllMocks();
});

describe('what it does not do', () => {
  it('creates no router of its own', () => {
    // Two routers writing one history is what makes Back go somewhere neither
    // of them meant.
    const useRoute = tanstackRouter();
    expect(useRoute).toBeTypeOf('function');
    renderHook(() => useRoute());
    // It only ever asked the host's router where it was.
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('reading the location', () => {
  it('reports the story from the path', () => {
    const [where] = at({ storyId: 'button' }).current;
    expect(where.story).toBe('button');
  });

  it('reports the default view when the segment is absent', () => {
    const [where] = at({ storyId: 'button' }).current;
    // Absent IS `preview`; the adapter must not invent a different default.
    expect(where.view).toBeUndefined();
  });

  it('reads a view written with a dash, as a path spells it', () => {
    const [where] = at({ storyId: 'poster-card', view: 'scene-1' }).current;
    expect(where.view).toBe('scene:1');
  });

  it('reads a view written with a colon, as a review comment spells it', () => {
    const [where] = at({ storyId: 'poster-card', view: 'scene:1' }).current;
    // Both parse, so a link written either way opens the same tab.
    expect(where.view).toBe('scene:1');
  });

  it('reads the matrix and demo tabs', () => {
    expect(at({ storyId: 'button', view: 'matrix' }).current[0].view).toBe('matrix');
    expect(at({ storyId: 'button', view: 'demo-0' }).current[0].view).toBe('demo:0');
  });

  it('ignores a view segment it does not recognise', () => {
    const [where] = at({ storyId: 'button', view: 'nonsense' }).current;
    // A hand-typed url falls back to the preview rather than to a blank canvas.
    expect(where.view).toBeUndefined();
  });

  it('reports no story when there is none in the path', () => {
    expect(at({}).current[0].story).toBeUndefined();
  });

  it('ignores params that are not strings', () => {
    const [where] = at({ storyId: 42, view: {} }).current;
    expect(where.story).toBeUndefined();
    expect(where.view).toBeUndefined();
  });

  it('reads the screenshot flag from its PRESENCE in the search', () => {
    // `?shot` is a runner's flag rather than a place you navigate to, so it
    // carries no value and no route has to validate it.
    expect(at({ storyId: 'button' }, { shot: '' }).current[0].shot).toBe(true);
    expect(at({ storyId: 'button' }, {}).current[0].shot).toBe(false);
  });
});

describe('navigating', () => {
  it('drops the view segment for the preview', () => {
    const [, go] = at({ storyId: 'button', view: 'matrix' }).current;
    go({ view: 'preview' });
    // The shortest url is the state you are in most of the time - which is why
    // there are two routes rather than one with a placeholder.
    expect(went().to).toBe('/story/$storyId');
    expect(went().params).toEqual({ storyId: 'button' });
  });

  it('writes a view segment with a DASH', () => {
    const [, go] = at({ storyId: 'poster-card' }).current;
    go({ view: 'scene:1' });
    // `scene:1` is fine in a search param and ugly in a path.
    expect(went().to).toBe('/story/$storyId/$view');
    expect(went().params).toEqual({ storyId: 'poster-card', view: 'scene-1' });
  });

  it('keeps the current story when only the tab changes', () => {
    const [, go] = at({ storyId: 'button' }).current;
    go({ view: 'matrix' });
    // The shell flips a tab without restating the story.
    expect(went().params).toEqual({ storyId: 'button', view: 'matrix' });
  });

  it('keeps the current tab when only the story changes', () => {
    const [, go] = at({ storyId: 'button', view: 'matrix' }).current;
    go({ story: 'chip' });
    // Walking the sidebar with the matrix tab open stays on the matrix tab.
    expect(went().params).toEqual({ storyId: 'chip', view: 'matrix' });
  });

  it('does nothing when there is no story anywhere', () => {
    const [, go] = at({}).current;
    go({ view: 'matrix' });
    // There is no such url as a view with no component.
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('what Back should undo', () => {
  it('REPLACES when only the tab changes', () => {
    const [, go] = at({ storyId: 'button' }).current;
    go({ view: 'matrix' });
    // Flipping to the matrix is not a page you should be able to press Back out
    // of; three tab flips would otherwise take three Backs to leave.
    expect(went().replace).toBe(true);
  });

  it('PUSHES when a different component is opened', () => {
    const [, go] = at({ storyId: 'button' }).current;
    go({ story: 'chip' });
    // Back returns to the component you were looking at, which is what a person
    // means by Back here.
    expect(went().replace).toBe(false);
  });

  it('lets the caller override either way', () => {
    const [, go] = at({ storyId: 'button' }).current;
    go({ story: 'chip' }, { replace: true });
    expect(went().replace).toBe(true);
  });
});

describe('the routes the host declares', () => {
  it('uses the host’s own paths when it mounts the workbench elsewhere', () => {
    route.params = { storyId: 'button' };
    route.search = {};
    const useRoute = tanstackRouter({
      storyRoute: '/design/$storyId',
      viewRoute: '/design/$storyId/$view',
    });
    const { result } = renderHook(() => useRoute());
    result.current[1]({ view: 'matrix' });
    // The adapter is mounted under a route tree this package knows nothing
    // about, which is what `strict: false` on the reads buys.
    expect(went().to).toBe('/design/$storyId/$view');
  });

  it('defaults to the documented pair', () => {
    const [, go] = at({ storyId: 'button' }).current;
    go({ view: 'matrix' });
    expect(went().to).toBe('/story/$storyId/$view');
  });
});
