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

  it('URL-encodes the module id', async () => {
    const { ctx, sent } = makeCtx();
    await moduleApi(ctx, 'weird/id').get('/x');
    expect(sent[0]?.path).toBe('/admin/m/weird%2Fid/x');
  });
});
