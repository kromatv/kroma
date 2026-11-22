// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useRouteGuards } from './use-route-guards.hook';

interface Mocks {
  replace: Mock;
  reset: Mock;
  onSearch: Mock<(handler: () => void) => () => void>;
  onListen: Mock<(handler: () => void) => () => void>;
  clearDeepLink: Mock;
  route: string;
  ready: boolean;
  user: { kids?: boolean } | null;
  deepLink: { type: 'movie' | 'show'; id: string } | null;
  movies: { id: string }[];
  shows: { id: string }[];
}

const mocks: Mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  reset: vi.fn(),
  onSearch: vi.fn(),
  onListen: vi.fn(),
  clearDeepLink: vi.fn(),
  route: 'home',
  ready: true,
  user: null,
  deepLink: null,
  movies: [],
  shows: [],
}));

vi.mock('#tv/app/router', () => ({
  useNav: () => ({ route: { name: mocks.route }, replace: mocks.replace, reset: mocks.reset }),
}));
vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: mocks.user, ready: mocks.ready }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({
    deepLink: mocks.deepLink,
    movies: mocks.movies,
    shows: mocks.shows,
    clearDeepLink: mocks.clearDeepLink,
  }),
}));
vi.mock('#tv/app/search-request', () => ({
  useSearchRequests: () => ({ onSearchRequest: mocks.onSearch, onListenRequest: mocks.onListen }),
}));

function asked(request: Mocks['onSearch']): () => void {
  return request.mock.calls[0]?.[0] ?? (() => undefined);
}

afterEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks, {
    route: 'home',
    ready: true,
    user: null,
    deepLink: null,
    movies: [],
    shows: [],
  });
});

describe('the television’s route guards', () => {
  it('take the television where its session must be', () => {
    renderHook(() => useRouteGuards());

    expect(mocks.replace).toHaveBeenCalledWith('profiles');
  });

  it('move nothing while the session is still being resumed', () => {
    mocks.ready = false;

    renderHook(() => useRouteGuards());

    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('answer the platform’s search once signed in', () => {
    mocks.user = {};
    renderHook(() => useRouteGuards());

    asked(mocks.onSearch)();

    expect(mocks.reset).toHaveBeenCalledWith('search');
  });

  it('leave the platform’s search and voice requests alone while signed out', () => {
    renderHook(() => useRouteGuards());

    expect(mocks.onSearch).not.toHaveBeenCalled();
    expect(mocks.onListen).not.toHaveBeenCalled();
  });

  it('open the search a voice request asks for', () => {
    mocks.user = {};
    renderHook(() => useRouteGuards());

    asked(mocks.onListen)();

    expect(mocks.reset).toHaveBeenCalledWith('search');
  });

  it('stay on the search when a voice request arrives there', () => {
    mocks.user = {};
    mocks.route = 'search';
    renderHook(() => useRouteGuards());

    asked(mocks.onListen)();

    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it('open the film a deep link names, then forget the link', () => {
    mocks.user = {};
    mocks.movies = [{ id: 'm1' }];
    mocks.deepLink = { type: 'movie', id: 'm1' };

    renderHook(() => useRouteGuards());

    expect(mocks.reset).toHaveBeenCalledWith('movie', { item: { id: 'm1' } });
    expect(mocks.clearDeepLink).toHaveBeenCalled();
  });

  it('open the show a deep link names, then forget the link', () => {
    mocks.user = {};
    mocks.shows = [{ id: 's1' }];
    mocks.deepLink = { type: 'show', id: 's1' };

    renderHook(() => useRouteGuards());

    expect(mocks.reset).toHaveBeenCalledWith('show', { show: { id: 's1' } });
    expect(mocks.clearDeepLink).toHaveBeenCalled();
  });

  it('keep a deep link until the catalogue holds its title', () => {
    mocks.user = {};
    mocks.deepLink = { type: 'show', id: 's1' };

    renderHook(() => useRouteGuards());

    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.clearDeepLink).not.toHaveBeenCalled();
  });

  it('open no deep link before anyone is signed in', () => {
    mocks.movies = [{ id: 'm1' }];
    mocks.deepLink = { type: 'movie', id: 'm1' };

    renderHook(() => useRouteGuards());

    expect(mocks.clearDeepLink).not.toHaveBeenCalled();
  });
});
