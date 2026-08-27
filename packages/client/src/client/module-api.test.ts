import { describe, expect, it } from 'vitest';
import type { RequestContext } from './base';
import { moduleApi } from './module-api';

interface Sent {
  path: string;
  init?: RequestInit;
}

function makeCtx(): { ctx: RequestContext; sent: Sent[] } {
  const sent: Sent[] = [];
  const ctx: RequestContext = {
    baseUrl: 'http://kroma.test',
    fetchFn: fetch,
    json<T>(path: string, init?: RequestInit): Promise<T> {
      sent.push({ path, init });
      return Promise.resolve(undefined as T);
    },
    blob: () => Promise.reject(new Error('unused')),
  };
  return { ctx, sent };
}

describe('moduleApi', () => {
  it('scopes every verb under /admin/m/<id>', async () => {
    const { ctx, sent } = makeCtx();
    const api = moduleApi(ctx, 'tv.kroma.vpn');
    await api.get('/vpn');
    await api.post('/vpn/test');
    await api.put('/vpn', { wgConfig: null });
    await api.delete('/vpn');
    expect(sent.map((s) => s.path)).toEqual([
      '/admin/m/tv.kroma.vpn/vpn',
      '/admin/m/tv.kroma.vpn/vpn/test',
      '/admin/m/tv.kroma.vpn/vpn',
      '/admin/m/tv.kroma.vpn/vpn',
    ]);
    expect(sent.map((s) => s.init?.method)).toEqual([undefined, 'POST', 'PUT', 'DELETE']);
  });

  it('sends JSON bodies with the content-type the server requires', async () => {
    const { ctx, sent } = makeCtx();
    const api = moduleApi(ctx, 'tv.kroma.vpn');
    await api.put('/vpn', { wgConfig: 'x' });
    await api.post('/vpn/test');
    const put = sent[0]?.init;
    expect(put?.headers).toEqual({ 'content-type': 'application/json' });
    expect(put?.body).toBe('{"wgConfig":"x"}');
    // A body-less POST must not claim a JSON body.
    expect(sent[1]?.init?.headers).toBeUndefined();
    expect(sent[1]?.init?.body).toBeUndefined();
  });

  it('hands a raw request through for what a JSON body cannot carry', async () => {
    const { ctx, sent } = makeCtx();
    const upload = new FormData();
    upload.append('file', new Blob(['x']), 'poster.png');

    await moduleApi(ctx, 'tv.kroma.vpn').send('/import', { method: 'POST', body: upload });

    expect(sent[0]?.path).toBe('/admin/m/tv.kroma.vpn/import');
    expect(sent[0]?.init?.method).toBe('POST');
    expect(sent[0]?.init?.body).toBe(upload);
    expect(sent[0]?.init?.headers).toBeUndefined();
  });

  it('URL-encodes the module id', async () => {
    const { ctx, sent } = makeCtx();
    await moduleApi(ctx, 'weird/id').get('/x');
    expect(sent[0]?.path).toBe('/admin/m/weird%2Fid/x');
  });
});
