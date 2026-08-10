// @vitest-environment jsdom

import { AdminHostProvider, ModuleScope } from '@kroma/module-sdk';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useTorrentsApi } from './api';

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
      <ModuleScope id="tv.kroma.torrents">{children}</ModuleScope>
    </AdminHostProvider>
  );
}

function api() {
  calls.length = 0;
  return renderHook(() => useTorrentsApi(), { wrapper }).result.current;
}

const one = () => {
  expect(calls).toHaveLength(1);
  return calls[0] as Call;
};

describe('useTorrentsApi', () => {
  it('is bound to the module the host is rendering, not to a written-down id', () => {
    api();
    expect(scopedTo.id).toBe('tv.kroma.torrents');
  });

  it('reads the queue off the module mount', async () => {
    await api().downloads();
    expect(one()).toEqual({ method: 'GET', path: '/downloads', body: undefined });
  });

  it('addresses one download by id for every per-item command', async () => {
    const a = api();
    await a.pause('d1');
    await a.resume('d1');
    await a.retry('d1');
    await a.reannounce('d1');
    expect(calls.map((c) => c.path)).toEqual([
      '/downloads/d1/pause',
      '/downloads/d1/resume',
      '/downloads/d1/retry',
      '/downloads/d1/reannounce',
    ]);
    expect(calls.every((c) => c.method === 'POST')).toBe(true);
  });

  it('escapes an id rather than letting it reshape the path', async () => {
    await api().pause('a/b?c');
    expect(one().path).toBe('/downloads/a%2Fb%3Fc/pause');
  });

  it('only asks for the data to be deleted when the caller says so', async () => {
    const a = api();
    await a.remove('d1');
    await a.remove('d1', { deleteData: false });
    await a.remove('d1', { deleteData: true });
    expect(calls.map((c) => c.path)).toEqual([
      '/downloads/d1',
      '/downloads/d1',
      '/downloads/d1?deleteData=true',
    ]);
    expect(calls.every((c) => c.method === 'DELETE')).toBe(true);
  });

  it('has a queue-wide form of each command that takes no id', async () => {
    const a = api();
    await a.pauseAll();
    await a.resumeAll();
    await a.reannounceAll();
    expect(calls).toEqual([
      { method: 'POST', path: '/downloads/pause-all', body: undefined },
      { method: 'POST', path: '/downloads/resume-all', body: undefined },
      { method: 'POST', path: '/downloads/reannounce', body: undefined },
    ]);
  });

  it('creates, updates, deletes and tests a download client', async () => {
    const a = api();
    const body = { name: 'rqbit', kind: 'rqbit' } as never;
    await a.clients();
    await a.createClient(body);
    await a.updateClient('c 1', body);
    await a.deleteClient('c 1');
    await a.testClient('c 1');
    expect(calls).toEqual([
      { method: 'GET', path: '/download-clients', body: undefined },
      { method: 'POST', path: '/download-clients', body },
      { method: 'PUT', path: '/download-clients/c%201', body },
      { method: 'DELETE', path: '/download-clients/c%201', body: undefined },
      { method: 'POST', path: '/download-clients/c%201/test', body: undefined },
    ]);
  });

  it('previews unsaved naming templates without saving them', async () => {
    const a = api();
    const templates = { movie: '{title}', episode: '{title}' } as never;
    await a.naming();
    await a.namingSample(templates);
    await a.saveNaming(templates);
    expect(calls).toEqual([
      { method: 'GET', path: '/organize/naming', body: undefined },
      { method: 'POST', path: '/organize/sample', body: templates },
      { method: 'PUT', path: '/organize/naming', body: templates },
    ]);
  });

  it('keeps the destructive organize behind its own verb', async () => {
    const a = api();
    await a.organizePreview();
    await a.organizeApply();
    expect(calls).toEqual([
      { method: 'GET', path: '/organize/preview', body: undefined },
      { method: 'POST', path: '/organize/apply', body: undefined },
    ]);
  });
});
