import { describe, expect, it } from 'vitest';
import { FLOOR } from './aggregate';
import { createApp, type Env, sweep } from './index';
import { BURST_LIMIT } from './integrity';
import type { Store } from './store';
import { allow, deny, memoryStore, ping, row } from './test-support';

const DAY = 86_400;
const NOW = 1_800_000_000;
const OTHER_ID = 'b'.repeat(64);

function env(overrides: Partial<Env> = {}): Env {
  return {
    STATS_DB: undefined as unknown as Env['STATS_DB'],
    PING_LIMIT: allow(),
    NEW_ID_LIMIT: allow(),
    ...overrides,
  };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  return new Request('https://stats.kroma.tv/v1/ping', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(json.length),
      ...headers,
    },
    body: json,
  });
}

function send(store: Store, request: Request, overrides: Partial<Env> = {}) {
  return createApp(() => store).fetch(request, env(overrides));
}

describe('POST /v1/ping', () => {
  it('refuses a body larger than a heartbeat could ever be', async () => {
    const store = memoryStore();

    const res = await send(store, post(ping(), { 'content-length': '99999' }));

    expect(res.status).toBe(413);
  });

  it('names the field it rejected and never echoes the payload', async () => {
    const store = memoryStore();

    const res = await send(store, post({ ...ping(), id: 'not-a-token' }));

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('id');
    expect(body.error).not.toContain('not-a-token');
  });

  it('refuses a module id that is not reverse-DNS', async () => {
    const store = memoryStore();

    const res = await send(store, post({ ...ping(), modules: ['../etc/passwd'] }));

    expect(res.status).toBe(400);
  });

  it('turns an install away when it pings far too often', async () => {
    const store = memoryStore();

    const res = await send(store, post(ping()), { PING_LIMIT: deny() });

    expect(res.status).toBe(429);
    expect(store.rows.size).toBe(0);
  });

  it('turns away a source minting install after install', async () => {
    const store = memoryStore();

    const res = await send(store, post(ping()), { NEW_ID_LIMIT: deny() });

    expect(res.status).toBe(429);
  });

  it('lets a known install keep reporting once the new-id budget is spent', async () => {
    const store = memoryStore([row({ id: ping().id, firstSeen: NOW - DAY, lastSeen: NOW - DAY })]);

    const res = await send(store, post(ping()), { NEW_ID_LIMIT: deny() });

    expect(res.status).toBe(200);
  });

  it('records the country the edge saw and never the address', async () => {
    const store = memoryStore();

    await send(store, post(ping(), { 'cf-connecting-ip': '203.0.113.7', 'cf-ipcountry': 'ch' }));

    const stored = [...store.rows.values()][0];
    expect(stored?.country).toBe('CH');
    expect(JSON.stringify(stored)).not.toContain('203.0.113.7');
  });

  it('ignores a country header that is not a country', async () => {
    const store = memoryStore();

    await send(store, post(ping(), { 'cf-ipcountry': 'XX-not-a-code' }));

    expect([...store.rows.values()][0]?.country).toBeNull();
  });

  it('keeps the day an install first appeared when it pings again', async () => {
    const store = memoryStore();

    await send(store, post(ping()));
    const first = [...store.rows.values()][0]?.firstSeen;
    await send(store, post({ ...ping(), version: '1.5.0' }));

    const stored = [...store.rows.values()][0];
    expect(store.rows.size).toBe(1);
    expect(stored?.firstSeen).toBe(first);
    expect(stored?.version).toBe('1.5.0');
  });
});

describe('GET /v1/stats', () => {
  it('answers the aggregate, cacheable and readable from anywhere', async () => {
    // The route reads the wall clock, so the fixtures hang off it too.
    const now = Math.floor(Date.now() / 1000);
    const store = memoryStore(
      Array.from({ length: FLOOR }, (_, i) =>
        row({ id: `id-${i}`, firstSeen: now - 30 * DAY, lastSeen: now - DAY }),
      ),
    );

    const res = await send(store, new Request('https://stats.kroma.tv/v1/stats'));

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toContain('max-age=3600');
    const body = (await res.json()) as { instances: number };
    expect(body.instances).toBe(FLOOR);
  });

  it('never returns a row, only counts', async () => {
    const store = memoryStore([
      row({ id: OTHER_ID, firstSeen: 0, lastSeen: Math.floor(Date.now() / 1000) }),
    ]);

    const res = await send(store, new Request('https://stats.kroma.tv/v1/stats'));

    expect(await res.text()).not.toContain(OTHER_ID);
  });
});

describe('an unknown route', () => {
  it('answers JSON, like everything else here', async () => {
    const res = await send(memoryStore(), new Request('https://stats.kroma.tv/nope'));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });
});

describe('sweep', () => {
  it('flags a fleet, writes the day down without it, and prunes what aged out', async () => {
    const fleet = Array.from({ length: BURST_LIMIT }, (_, i) =>
      row({ id: `fleet-${i}`, firstSeen: NOW - 30 * DAY, lastSeen: NOW - DAY }),
    );
    const real = row({
      id: OTHER_ID,
      firstSeen: NOW - 30 * DAY,
      lastSeen: NOW - DAY,
      version: '9.9.9',
    });
    const ancient = row({ id: 'c'.repeat(64), firstSeen: 0, lastSeen: NOW - 200 * DAY });
    const store = memoryStore([...fleet, real, ancient]);

    await sweep(store, NOW);

    expect(store.rows.get('fleet-0')?.flagged).toBe(true);
    expect(store.rows.get(OTHER_ID)?.flagged).toBe(false);
    expect(store.rows.has('c'.repeat(64))).toBe(false);
    expect(await store.daily()).toEqual([{ day: '2027-01-15', instances: 1, clients: 3 }]);
  });
});
