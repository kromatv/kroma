// @vitest-environment jsdom

import { AdminHostProvider, ModuleScope } from '@kroma/module-sdk';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useIndexerApi } from './api';

type Call = { method: string; path: string; body?: unknown };

const calls: Call[] = [];

const record = (method: string) => (path: string, body?: unknown) => {
  calls.push({ method, path, body });
  return Promise.resolve({ ok: true });
};

const scopedTo = { id: '' };

const client = {
  module(id: string) {
    scopedTo.id = id;
    return {
      get: record('GET'),
      post: record('POST'),
      put: record('PUT'),
      delete: record('DELETE'),
    };
  },
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AdminHostProvider value={{ client, user: null, apiBase: '' } as never}>
      <ModuleScope id="tv.kroma.indexer">{children}</ModuleScope>
    </AdminHostProvider>
  );
}

function api() {
  calls.length = 0;
  return renderHook(() => useIndexerApi(), { wrapper }).result.current;
}

const body = { name: 'Tracker', url: 'http://t.example' } as never;

describe('useIndexerApi', () => {
  it('is bound to the module the host is rendering, not to a written-down id', () => {
    api();
    expect(scopedTo.id).toBe('tv.kroma.indexer');
  });

  it('drives the configured indexers through one collection', async () => {
    const a = api();
    await a.list();
    await a.create(body);
    await a.update('i1', body);
    await a.remove('i1');
    await a.test('i1');
    expect(calls).toEqual([
      { method: 'GET', path: '/indexers', body: undefined },
      { method: 'POST', path: '/indexers', body },
      { method: 'PUT', path: '/indexers/i1', body },
      { method: 'DELETE', path: '/indexers/i1', body: undefined },
      { method: 'POST', path: '/indexers/i1/test', body: undefined },
    ]);
  });

  it('escapes an id rather than letting it reshape the path', async () => {
    const a = api();
    await a.update('a/b', body);
    await a.remove('a/b');
    await a.test('a/b');
    expect(calls.map((c) => c.path)).toEqual([
      '/indexers/a%2Fb',
      '/indexers/a%2Fb',
      '/indexers/a%2Fb/test',
    ]);
  });

  it('keeps the definition catalog under the indexers mount', async () => {
    const a = api();
    await a.definitions();
    await a.definition('the tracker');
    await a.syncDefinitions();
    expect(calls).toEqual([
      { method: 'GET', path: '/indexers/definitions', body: undefined },
      { method: 'GET', path: '/indexers/definitions/the%20tracker', body: undefined },
      { method: 'POST', path: '/indexers/definitions/sync', body: undefined },
    ]);
  });
});
