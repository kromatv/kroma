// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryRouter, parseView, pathRouter, searchParamsRouter, viewPath } from './router';

describe('parseView', () => {
  it('takes the two named views', () => {
    expect(parseView('preview')).toBe('preview');
    expect(parseView('matrix')).toBe('matrix');
  });

  it('takes a scene or a demo in either spelling', () => {
    expect(parseView('scene:1')).toBe('scene:1');
    expect(parseView('scene-1')).toBe('scene:1');
    expect(parseView('demo:0')).toBe('demo:0');
    expect(parseView('demo-0')).toBe('demo:0');
  });

  it('still takes the bare number a scene used to be', () => {
    expect(parseView('2')).toBe('scene:2');
  });

  it('refuses anything else rather than guessing', () => {
    expect(parseView(undefined)).toBeUndefined();
    expect(parseView('')).toBeUndefined();
    expect(parseView('scene')).toBeUndefined();
    expect(parseView('scene:x')).toBeUndefined();
    expect(parseView('../etc/passwd')).toBeUndefined();
  });
});

describe('viewPath', () => {
  it('spells a view for a path, and the default as nothing', () => {
    expect(viewPath('matrix')).toBe('matrix');
    expect(viewPath('scene:1')).toBe('scene-1');
    expect(viewPath('demo:0')).toBe('demo-0');
    // `preview` is spelled by being absent.
    expect(viewPath('preview')).toBeNull();
    expect(viewPath(undefined)).toBeNull();
  });

  it('round-trips every view it can spell', () => {
    for (const view of ['matrix', 'scene:0', 'scene:12', 'demo:3'] as const) {
      expect(parseView(viewPath(view))).toBe(view);
    }
  });
});

describe('memoryRouter', () => {
  it('is a hook, so a fresh adapter per render would remount its state', () => {
    expect(typeof memoryRouter()).toBe('function');
    expect(memoryRouter({ story: 'button' })).not.toBe(memoryRouter({ story: 'button' }));
  });

  it('merges each navigation onto where it already is, touching no address bar', () => {
    const before = window.location.href;
    const { result } = renderHook(memoryRouter({ story: 'button' }));
    act(() => result.current[1]({ view: 'matrix' }));
    expect(result.current[0]).toEqual({ story: 'button', view: 'matrix' });
    act(() => result.current[1]({ story: 'card' }));
    expect(result.current[0]).toEqual({ story: 'card', view: 'matrix' });
    expect(window.location.href).toBe(before);
  });
});

const at = (url: string) => window.history.replaceState(null, '', url);

beforeEach(() => at('/'));
afterEach(cleanup);

describe('searchParamsRouter', () => {
  it('reads the story, the view and the screenshot flag off the query', () => {
    at('/anything?story=button&view=scene-2&shot');
    const { result } = renderHook(searchParamsRouter());
    expect(result.current[0]).toEqual({ story: 'button', view: 'scene:2', shot: true });
  });

  it('leaves the path alone, so a host router keeps its own route', () => {
    at('/tv/home?workbench');
    const { result } = renderHook(searchParamsRouter());
    act(() => result.current[1]({ story: 'button', view: 'matrix' }));
    expect(window.location.pathname).toBe('/tv/home');
    expect(new URLSearchParams(window.location.search).get('story')).toBe('button');
  });

  it('keeps ?workbench, and spells the default view by removing it', () => {
    at('/?workbench&view=matrix');
    const { result } = renderHook(searchParamsRouter());
    act(() => result.current[1]({ story: 'button', view: 'preview' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('workbench')).toBe(true);
    expect(params.has('view')).toBe(false);
    expect(result.current[0]).toMatchObject({ story: 'button', view: 'preview' });
  });
});

describe('pathRouter', () => {
  it('reads a story and its view out of the path', () => {
    at('/story/button/scene-3?shot');
    const { result } = renderHook(pathRouter());
    expect(result.current[0]).toEqual({ story: 'button', view: 'scene:3', shot: true });
  });

  it('mounts under a base whether or not it was given a trailing slash', () => {
    at('/kit/story/button/matrix');
    for (const base of ['/kit', '/kit/']) {
      const { result } = renderHook(pathRouter({ base }));
      expect(result.current[0]).toMatchObject({ story: 'button', view: 'matrix' });
    }
  });

  it('falls back to ?story= for a path it did not write', () => {
    at('/anything/else?story=card&view=matrix');
    const { result } = renderHook(pathRouter());
    expect(result.current[0]).toMatchObject({ story: 'card', view: 'matrix' });
  });

  it('writes a real path, encoding a story name that would otherwise be a segment', () => {
    const { result } = renderHook(pathRouter());
    act(() => result.current[1]({ story: 'atoms/button' }));
    expect(window.location.pathname).toBe('/story/atoms%2Fbutton');
    act(() => result.current[1]({ view: 'matrix' }));
    expect(window.location.pathname).toBe('/story/atoms%2Fbutton/matrix');
  });

  it('pushes a new story and replaces everything else', () => {
    const { result } = renderHook(pathRouter());
    const start = window.history.length;
    act(() => result.current[1]({ story: 'button' }));
    expect(window.history).toHaveLength(start + 1);

    act(() => result.current[1]({ view: 'matrix' }));
    act(() => result.current[1]({ story: 'button' }));
    expect(window.history).toHaveLength(start + 1);

    act(() => result.current[1]({ story: 'card' }, { replace: true }));
    expect(window.history).toHaveLength(start + 1);
    expect(window.location.pathname).toBe('/story/card/matrix');
  });

  it('keeps the query string across a navigation', () => {
    at('/?shot');
    const { result } = renderHook(pathRouter());
    act(() => result.current[1]({ story: 'button' }));
    expect(window.location.search).toBe('?shot');
  });

  it('writes nothing until there is a story to write', () => {
    const { result } = renderHook(pathRouter());
    act(() => result.current[1]({ view: 'matrix' }));
    expect(window.location.pathname).toBe('/');
    expect(result.current[0]).toMatchObject({ view: 'matrix' });
  });

  it('re-reads the path when the reader presses Back', () => {
    const { result } = renderHook(pathRouter());
    act(() => result.current[1]({ story: 'button' }));
    at('/story/card/matrix');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0]).toMatchObject({ story: 'card', view: 'matrix' });
  });
});
