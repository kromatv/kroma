// @vitest-environment jsdom

import { AdminHostProvider } from '@kromatv/module-sdk';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useAcquisitionApi } from './api';

type Call = { method: string; path: string; body?: unknown };

const calls: Call[] = [];

const read = (method: string) => (path: string) => {
  calls.push({ method, path, body: undefined });
  return Promise.resolve({ ok: true });
};

const write = (method: string) => (path: string, body?: unknown) => {
  calls.push({ method, path, body });
  return Promise.resolve({ ok: true });
};

const scopedTo = { id: '' };

const client = {
  modules: {
    api(id: string) {
      scopedTo.id = id;
      return {
        get: read('GET'),
        post: write('POST'),
        put: write('PUT'),
        delete: read('DELETE'),
      };
    },
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminHostProvider value={{ client, user: null, apiBase: '' } as never}>
      {children}
    </AdminHostProvider>
  );
}

type Api = ReturnType<typeof useAcquisitionApi>;

function api() {
  calls.length = 0;
  return renderHook(() => useAcquisitionApi(), { wrapper }).result.current;
}

describe('useAcquisitionApi', () => {
  it('names the module it addresses, so another module can call it', () => {
    api();
    expect(scopedTo.id).toBe('tv.kroma.acquisition');
  });

  it('carries the search terms in the body, never in the path', async () => {
    const body = { query: 'the matrix 1999' };
    await api().search(body);
    expect(calls).toEqual([{ method: 'POST', path: '/acquisition/search', body }]);
  });

  it('carries the season and episode a show search is narrowed by', async () => {
    // Without them the far side builds a movie query and searches the wrong
    // tracker categories, so a specific episode is never found.
    const body = { query: 'breaking bad', kind: 'episode', season: 3, episode: 7 };
    await api().search(body);
    expect(calls).toEqual([{ method: 'POST', path: '/acquisition/search', body }]);
  });

  it('inspects a torrent before anything is grabbed', async () => {
    await api().analyze('magnet:?xt=urn:btih:deadbeef');
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/acquisition/analyze',
        body: { magnetOrUrl: 'magnet:?xt=urn:btih:deadbeef' },
      },
    ]);
  });

  it('passes the whole grab through as the body of one add', async () => {
    const body = { magnetOrUrl: 'magnet:?xt=urn:btih:beef', kind: 'movie' } as never;
    await api().add(body);
    expect(calls).toEqual([{ method: 'POST', path: '/acquisition/add', body }]);
  });

  it.each([
    ['reads the rules', (a: Api) => a.rules(), { method: 'GET', path: '/acquisition/rules' }],
    [
      'tests a release name against the rules',
      (a: Api) => a.testRules('Show.S01E01', 'fr'),
      {
        method: 'POST',
        path: '/acquisition/rules/test',
        body: { name: 'Show.S01E01', original: 'fr' },
      },
    ],
    [
      'escapes a profile id in the path it saves to',
      (a: Api) => a.saveProfile({ id: 'a/b' } as never),
      { method: 'PUT', path: '/acquisition/profiles/a%2Fb', body: { id: 'a/b' } },
    ],
    [
      'escapes a profile id in the path it deletes',
      (a: Api) => a.deleteProfile('a b'),
      { method: 'DELETE', path: '/acquisition/profiles/a%20b' },
    ],
    [
      'sets the default profile',
      (a: Api) => a.setDefaultProfile('p1'),
      { method: 'PUT', path: '/acquisition/default-profile', body: { id: 'p1' } },
    ],
    [
      'saves a format under its escaped id',
      (a: Api) => a.saveFormat({ id: 'f/1' } as never),
      { method: 'PUT', path: '/acquisition/formats/f%2F1', body: { id: 'f/1' } },
    ],
    [
      'deletes a format by its escaped id',
      (a: Api) => a.deleteFormat('f/1'),
      { method: 'DELETE', path: '/acquisition/formats/f%2F1' },
    ],
    [
      'saves the size limits',
      (a: Api) => a.saveSizes({ movie: 1 } as never),
      { method: 'PUT', path: '/acquisition/sizes', body: { movie: 1 } },
    ],
    [
      'reads one title rules',
      (a: Api) => a.titleRules('show', 5),
      { method: 'GET', path: '/acquisition/titles/show/5' },
    ],
    [
      'puts a title back under the default profile with a null id',
      (a: Api) => a.setTitleProfile('movie', 5, null),
      {
        method: 'PUT',
        path: '/acquisition/titles/movie/5/profile',
        body: { profileId: null },
      },
    ],
    [
      'searches a title in a scope',
      (a: Api) => a.searchTitle('show', 5, { season: 1 } as never),
      {
        method: 'POST',
        path: '/acquisition/titles/show/5/search',
        body: { scope: { season: 1 } },
      },
    ],
    [
      'grabs one release for a title',
      (a: Api) => a.grabForTitle('show', 5, { scope: {}, guid: 'g', indexerId: 'i' } as never),
      {
        method: 'POST',
        path: '/acquisition/titles/show/5/grab',
        body: { scope: {}, guid: 'g', indexerId: 'i' },
      },
    ],
    [
      'searches everything a title is missing when no unit is named',
      (a: Api) => a.searchNow('show', 5),
      {
        method: 'POST',
        path: '/acquisition/titles/show/5/search-now',
        body: { units: [] },
      },
    ],
    [
      'searches only the units it is handed',
      (a: Api) => a.searchNow('show', 5, [{ season: 1, episode: 2 }]),
      {
        method: 'POST',
        path: '/acquisition/titles/show/5/search-now',
        body: { units: [{ season: 1, episode: 2 }] },
      },
    ],
    [
      'sweeps the cutoff',
      (a: Api) => a.searchCutoffNow(),
      { method: 'POST', path: '/acquisition/cutoff/search-now', body: {} },
    ],
    [
      'reads the cutoff list',
      (a: Api) => a.cutoff(),
      { method: 'GET', path: '/acquisition/cutoff' },
    ],
    [
      'reads the blocklist',
      (a: Api) => a.blocklist(),
      { method: 'GET', path: '/acquisition/blocklist' },
    ],
    [
      'unblocks a release by its escaped id',
      (a: Api) => a.unblock('x/y'),
      { method: 'DELETE', path: '/acquisition/blocklist/x%2Fy' },
    ],
  ])('%s', async (_name, call, expected) => {
    await call(api());

    expect(calls).toEqual([{ body: undefined, ...expected }]);
  });
});
