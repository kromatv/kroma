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

const recordSend = (path: string, init: RequestInit) => {
  calls.push({ method: init.method ?? 'GET', path, body: init.body });
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
      send: recordSend,
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

  it('sends only the filters that were set, so the server owns every default', async () => {
    await api().downloads({ page: 2, status: 'active', q: '', kind: undefined });
    expect(one().path).toBe('/downloads?page=2&status=active');
  });

  it('an empty query reads the queue off the bare mount', async () => {
    await api().downloads();
    expect(one()).toEqual({ method: 'GET', path: '/downloads', body: undefined });
  });

  it('sends a .torrent up as raw bytes rather than as JSON', async () => {
    const file = new Blob([new Uint8Array([1, 2, 3])]);

    await api().inspectTorrent(file);

    expect(one()).toEqual({ method: 'POST', path: '/downloads/torrent', body: file });
  });

  it('reads and writes the engine-wide ceilings at one address', async () => {
    const a = api();
    const limits = { downKbps: 0, upKbps: 512, maxActive: 3 };
    await a.limits();
    await a.saveLimits(limits);
    expect(calls).toEqual([
      { method: 'GET', path: '/downloads/limits', body: undefined },
      { method: 'PUT', path: '/downloads/limits', body: limits },
    ]);
  });

  it('asks the server what a queued torrent holds, never handing the magnet back', async () => {
    await api().contents('a/b');
    expect(one()).toEqual({ method: 'GET', path: '/downloads/a%2Fb/contents', body: undefined });
  });

  it('asks for episode names by title and season', async () => {
    await api().episodes(1399, 0);
    expect(one().path).toBe('/downloads/episodes?tmdbId=1399&season=0');
  });

  it('searches titles with no download row, for the manual-add flow', async () => {
    await api().searchTitles('dune', 'movie', 2021);
    expect(one().path).toBe('/downloads/candidates?q=dune&kind=movie&year=2021');
  });

  it('escapes the id on the linking routes the same way the others do', async () => {
    await api().link('a/b?c', { kind: 'movie', tmdbId: 603 });
    expect(one().path).toBe('/downloads/a%2Fb%3Fc/link');
  });

  it('asks for candidates with the operator words when they typed some', async () => {
    await api().candidates('d1', 'the matrix', 'movie');
    expect(one().path).toBe('/downloads/d1/candidates?q=the+matrix&kind=movie');
  });

  it('asks for candidates off the release name when they did not', async () => {
    await api().candidates('d1');
    expect(one().path).toBe('/downloads/d1/candidates');
  });
});
