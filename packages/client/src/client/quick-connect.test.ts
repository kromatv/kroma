import { describe, expect, it } from 'vitest';
import { KromaApiError, type RequestContext } from './base';
import { quickConnectInitiate, quickConnectPoll } from './quick-connect';

// Every case gets its own baseUrl: the legacy fallback is remembered per server,
// and that memory outlives a single test.
function pollCtx(baseUrl: string, reply: (path: string) => unknown) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl,
    json: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return reply(path) as never;
    },
  } as unknown as RequestContext;
  return { ctx, calls, paths: () => calls.map((c) => c.path) };
}

function updatedServer(path: string): unknown {
  if (path.includes('?')) throw new KromaApiError(404, 'the query form is gone');
  return { status: 'pending' };
}

function serverBeforeTheHeader(path: string): unknown {
  if (!path.includes('?')) throw new KromaApiError(400, 'GET /auth/quickconnect/poll failed (400)');
  return { status: 'pending' };
}

describe('quickConnectInitiate', () => {
  it('asks for a code and sends no body when there is nothing to revoke', async () => {
    const { ctx, calls } = pollCtx('http://fresh', () => ({}));
    await quickConnectInitiate(ctx).catch(() => undefined);
    expect(calls[0]?.path).toBe('/auth/quickconnect/initiate');
    expect(calls[0]?.init?.body).toBeUndefined();
  });

  // Rotating an expiring code revokes the old one up front, so it stops being
  // approvable rather than lingering until its TTL runs out.
  it('carries the previous secret when one is rotating out', async () => {
    const { ctx, calls } = pollCtx('http://rotating', () => ({}));
    await quickConnectInitiate(ctx, 's3cr3t').catch(() => undefined);
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ prevSecret: 's3cr3t' }));
    expect(new Headers(calls[0]?.init?.headers).get('content-type')).toContain('application/json');
  });
});

describe('quickConnectPoll', () => {
  it('sends the secret in a header, never in the URL', async () => {
    const { ctx, calls } = pollCtx('http://updated', updatedServer);
    await expect(quickConnectPoll(ctx, 'a b&c=d')).resolves.toEqual({ status: 'pending' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/auth/quickconnect/poll');
    expect(new Headers(calls[0]?.init?.headers).get('x-kroma-pairing-secret')).toBe('a b&c=d');
  });

  it('retries with the legacy query when the server is too old to read the header', async () => {
    const { ctx, paths } = pollCtx('http://old', serverBeforeTheHeader);
    await expect(quickConnectPoll(ctx, 'a b&c=d')).resolves.toEqual({ status: 'pending' });
    expect(paths()).toEqual([
      '/auth/quickconnect/poll',
      '/auth/quickconnect/poll?secret=a%20b%26c%3Dd',
    ]);
  });

  it('keeps the legacy form for that server instead of re-probing every poll', async () => {
    const { ctx, paths } = pollCtx('http://old-remembered', serverBeforeTheHeader);
    await quickConnectPoll(ctx, 's3cr3t');
    await quickConnectPoll(ctx, 's3cr3t');
    await quickConnectPoll(ctx, 's3cr3t');
    expect(paths()).toEqual([
      '/auth/quickconnect/poll',
      '/auth/quickconnect/poll?secret=s3cr3t',
      '/auth/quickconnect/poll?secret=s3cr3t',
      '/auth/quickconnect/poll?secret=s3cr3t',
    ]);
  });

  it('downgrades only the server that asked for it', async () => {
    const old = pollCtx('http://old-of-two', serverBeforeTheHeader);
    const updated = pollCtx('http://updated-of-two', updatedServer);
    await quickConnectPoll(old.ctx, 's3cr3t');
    await quickConnectPoll(updated.ctx, 's3cr3t');
    await quickConnectPoll(updated.ctx, 's3cr3t');
    expect(updated.paths()).toEqual(['/auth/quickconnect/poll', '/auth/quickconnect/poll']);
  });

  it('does not downgrade on a failure an updated server can produce', async () => {
    const { ctx, calls } = pollCtx('http://flaky', () => {
      throw new KromaApiError(503, 'proxy is warming up');
    });
    await expect(quickConnectPoll(ctx, 's3cr3t')).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });

  it('refuses a reply that is not a pairing status', async () => {
    const { ctx } = pollCtx('http://liar', () => ({ status: 'authorized' }));
    await expect(quickConnectPoll(ctx, 's3cr3t')).rejects.toThrow();
  });
});
