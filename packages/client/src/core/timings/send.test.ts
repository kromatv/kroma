import { describe, expect, it, vi } from 'vitest';
import { sendTimings } from './send';

const samples = [{ kind: 'api' as const, name: 'GET /api/home', ms: 40, serverMs: 30 }];

function target(status: number, token = 'bearer-1') {
  const fetchFn = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status }));
  return { fetchFn, base: () => 'https://kroma.test', token: () => token, app: 'web/0.1.40' };
}

describe('sendTimings', () => {
  it('posts the samples as the signed-in device', async () => {
    const t = target(204);

    const result = await sendTimings(t, samples);

    expect(result).toBe('sent');
    const [url, init] = t.fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('https://kroma.test/api/perf/client');
    expect(new Headers(init?.headers).get('X-Kroma-Client')).toBe('web/0.1.40');
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({ samples });
  });

  it('tells a server without the route from one that took the report', async () => {
    expect(await sendTimings(target(404), samples)).toBe('refused');
  });

  it('drops the samples while nobody is signed in', async () => {
    const t = target(204, '');

    await sendTimings(t, samples);

    expect(t.fetchFn).not.toHaveBeenCalled();
  });
});
