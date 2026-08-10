// @vitest-environment jsdom

import { AdminHostProvider } from '@kroma/module-sdk';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useAcquisitionApi } from './api';

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
      {children}
    </AdminHostProvider>
  );
}

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
    await api().search('the matrix 1999');
    expect(calls).toEqual([
      { method: 'POST', path: '/acquisition/search', body: { query: 'the matrix 1999' } },
    ]);
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
});
