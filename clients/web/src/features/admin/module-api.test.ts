import { sessionToken, setSessionToken } from '@kroma/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AdminModule,
  adminApi,
  fetchAdminModules,
  fetchInstallPlan,
  fetchStoreCatalog,
  installBundle,
  installById,
  matchesQuery,
  message,
  previewRegistry,
  setModuleEnabled,
  UninstallConflictError,
  uninstallModule,
  updateModules,
} from './module-api';

let calls: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  calls = [];
  setSessionToken(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionToken(undefined);
});

function stubFetch(res: Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return res;
    }),
  );
}

// Throws when there is no call, rather than returning nothing: otherwise a test
// asserting an absent header would pass for the wrong reason (no request was made).
const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  if (!init) throw new Error('expected a recorded fetch call, but none was made');
  return init.headers as Record<string, string>;
};

const unreadable = (status: number) =>
  ({
    ok: false,
    status,
    text: () => Promise.reject(new Error('stream closed')),
  }) as unknown as Response;

describe('adminApi', () => {
  it('GETs /api/admin<path> and parses the JSON body', async () => {
    stubFetch(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await adminApi<{ ok: number }>('/modules');
    expect(out).toEqual({ ok: 1 });
    expect(calls[0]?.url.endsWith('/api/admin/modules')).toBe(true);
  });

  it('adds a Bearer header when a session token is present', async () => {
    setSessionToken('tok123');
    expect(sessionToken()).toBe('tok123');
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init).Authorization).toBe('Bearer tok123');
  });

  it('omits the Authorization header when signed out', async () => {
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init).Authorization).toBeUndefined();
  });

  it('sets a JSON Content-Type only when there is a body', async () => {
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules/x/config', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    expect(headersOf(calls[0]?.init)['Content-Type']).toBe('application/json');

    calls = [];
    stubFetch(new Response('{}', { status: 200 }));
    await adminApi('/modules');
    expect(headersOf(calls[0]?.init)['Content-Type']).toBeUndefined();
  });

  it('returns undefined for a 204 No Content', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(adminApi('/modules/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws the server message on a non-OK response', async () => {
    stubFetch(new Response('dependency conflict', { status: 409 }));
    await expect(adminApi('/modules/x/install', { method: 'POST' })).rejects.toThrow(
      'dependency conflict',
    );
  });

  it('falls back to a method/path/status message when the body is empty', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(adminApi('/modules/x', { method: 'DELETE' })).rejects.toThrow(
      'DELETE /modules/x -> 500',
    );
  });

  it('defaults the fallback verb to GET', async () => {
    stubFetch(new Response('', { status: 500 }));
    await expect(adminApi('/modules')).rejects.toThrow('GET /modules -> 500');
  });

  it('still reports the status when the error body cannot be read', async () => {
    stubFetch(unreadable(502));
    await expect(adminApi('/modules')).rejects.toThrow('GET /modules -> 502');
  });
});

describe('message', () => {
  it('takes an Error at its word and stringifies anything else', () => {
    expect(message(new Error('checksum mismatch'))).toBe('checksum mismatch');
    expect(message('plain string')).toBe('plain string');
    expect(message(404)).toBe('404');
    expect(message(null)).toBe('null');
  });
});

describe('matchesQuery', () => {
  const mod = { id: 'tv.kroma.torrents', name: 'Torrents', description: 'Download engine' };

  it('matches an empty or whitespace query', () => {
    expect(matchesQuery(mod, '')).toBe(true);
    expect(matchesQuery(mod, '   ')).toBe(true);
  });

  it('matches on id, name and description, case-insensitively', () => {
    expect(matchesQuery(mod, 'KROMA.TOR')).toBe(true);
    expect(matchesQuery(mod, 'torrents')).toBe(true);
    expect(matchesQuery(mod, 'download')).toBe(true);
    expect(matchesQuery(mod, 'vpn')).toBe(false);
  });

  it('treats a missing description as empty rather than matching everything', () => {
    expect(matchesQuery({ id: 'a', name: 'A', description: null }, 'engine')).toBe(false);
    expect(matchesQuery({ id: 'a', name: 'A' }, 'a')).toBe(true);
  });
});

describe('the module endpoints', () => {
  const bodyOf = (init: RequestInit | undefined): unknown =>
    JSON.parse(String(init?.body ?? 'null'));

  it('lists the installed modules', async () => {
    const rows: AdminModule[] = [
      { id: 'tv.kroma.vpn', enabled: true, configValues: {}, removable: true } as AdminModule,
    ];
    stubFetch(new Response(JSON.stringify(rows), { status: 200 }));
    await expect(fetchAdminModules()).resolves.toEqual(rows);
    expect(calls[0]?.url.endsWith('/api/admin/modules')).toBe(true);
  });

  it('POSTs the enabled flag under the url-encoded id and parses the verdict', async () => {
    stubFetch(
      new Response(JSON.stringify({ id: 'tv.kroma.vpn', enabled: true, warning: 'sidecar died' }), {
        status: 200,
      }),
    );
    const res = await setModuleEnabled('tv.kroma.vpn', true);
    expect(res.warning).toBe('sidecar died');
    expect(calls[0]?.url.endsWith('/api/admin/modules/tv.kroma.vpn/enabled')).toBe(true);
    expect(bodyOf(calls[0]?.init)).toEqual({ enabled: true });
  });

  it('rejects a malformed enabled verdict rather than passing it on', async () => {
    stubFetch(new Response(JSON.stringify({ id: 'x' }), { status: 200 }));
    await expect(setModuleEnabled('x', false)).rejects.toThrow();
  });

  it('parses the store catalog', async () => {
    const catalog = {
      schema: 1,
      serverVersion: '0.1.3',
      target: 'darwin-arm64',
      registryUrl: 'https://modules.kroma.tv',
      registries: [],
      modules: [],
    };
    stubFetch(new Response(JSON.stringify(catalog), { status: 200 }));
    await expect(fetchStoreCatalog()).resolves.toEqual(catalog);
    expect(calls[0]?.url.endsWith('/api/admin/store/catalog')).toBe(true);
  });

  it('dry-runs an install, defaulting the opted-in extras to none', async () => {
    const plan = {
      requested: 'tv.kroma.torrents',
      modules: [],
      optional: [],
      missing: [],
      totalSize: 0,
    };
    stubFetch(new Response(JSON.stringify(plan), { status: 200 }));
    await expect(fetchInstallPlan('tv.kroma.torrents')).resolves.toEqual(plan);
    expect(bodyOf(calls[0]?.init)).toEqual({ id: 'tv.kroma.torrents', include: [] });

    calls = [];
    stubFetch(new Response(JSON.stringify(plan), { status: 200 }));
    await fetchInstallPlan('tv.kroma.torrents', ['tv.kroma.vpn']);
    expect(bodyOf(calls[0]?.init)).toEqual({
      id: 'tv.kroma.torrents',
      include: ['tv.kroma.vpn'],
    });
  });

  it('installs by id and reports what landed', async () => {
    const report = {
      op: 'op-1',
      requested: 'tv.kroma.torrents',
      installed: [{ id: 'tv.kroma.torrents', name: 'Torrents', version: '0.1.5' }],
    };
    stubFetch(new Response(JSON.stringify(report), { status: 200 }));
    await expect(installById('tv.kroma.torrents')).resolves.toEqual(report);
    expect(calls[0]?.url.endsWith('/api/admin/store/install-id')).toBe(true);
    expect(bodyOf(calls[0]?.init)).toEqual({ id: 'tv.kroma.torrents', include: [] });
  });

  it('updates the named modules, or every outdated one when none are named', async () => {
    const result = { updated: [{ id: 'a', from: '1.0.0', to: '1.1.0' }], failed: [] };
    stubFetch(new Response(JSON.stringify(result), { status: 200 }));
    await expect(updateModules(['a'])).resolves.toEqual(result);
    expect(bodyOf(calls[0]?.init)).toEqual({ ids: ['a'] });

    calls = [];
    stubFetch(new Response(JSON.stringify(result), { status: 200 }));
    await updateModules();
    expect(bodyOf(calls[0]?.init)).toEqual({});
  });

  it('previews a candidate registry before it is saved', async () => {
    const preview = {
      ok: true,
      moduleCount: 1,
      modules: [{ id: 'x.y.z', name: 'Z', version: '1.0.0', library: false }],
    };
    stubFetch(new Response(JSON.stringify(preview), { status: 200 }));
    await expect(previewRegistry('https://mods.example/catalog.json')).resolves.toMatchObject({
      ok: true,
      moduleCount: 1,
    });
    expect(bodyOf(calls[0]?.init)).toEqual({ url: 'https://mods.example/catalog.json' });
  });
});

describe('uninstallModule', () => {
  it('DELETEs the module, adding ?force=true only when forced', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await uninstallModule('tv.kroma.vpn');
    expect(calls[0]?.url.endsWith('/api/admin/store/tv.kroma.vpn')).toBe(true);
    expect(calls[0]?.init.method).toBe('DELETE');

    calls = [];
    stubFetch(new Response(null, { status: 204 }));
    await uninstallModule('tv.kroma.vpn', true);
    expect(calls[0]?.url.endsWith('/api/admin/store/tv.kroma.vpn?force=true')).toBe(true);
  });

  it('turns a 409 into an error carrying the dependents', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: 'still needed', dependents: ['tv.kroma.torrents'] }), {
        status: 409,
      }),
    );
    const err = await uninstallModule('tv.kroma.vpn').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UninstallConflictError);
    expect((err as UninstallConflictError).name).toBe('UninstallConflictError');
    expect((err as UninstallConflictError).message).toBe('still needed');
    expect((err as UninstallConflictError).dependents).toEqual(['tv.kroma.torrents']);
  });

  it('surfaces the server text on any other failure, else the status', async () => {
    stubFetch(new Response('busy', { status: 500 }));
    await expect(uninstallModule('x')).rejects.toThrow('busy');

    stubFetch(new Response('', { status: 503 }));
    await expect(uninstallModule('x')).rejects.toThrow('uninstall failed (503)');

    stubFetch(unreadable(502));
    await expect(uninstallModule('x')).rejects.toThrow('uninstall failed (502)');
  });
});

describe('installBundle', () => {
  it('POSTs the raw .kmod with no JSON content type', async () => {
    const file = new File(['kmod-bytes'], 'notes.kmod');
    stubFetch(new Response(null, { status: 204 }));
    await installBundle(file);
    expect(calls[0]?.url.endsWith('/api/admin/store/install')).toBe(true);
    expect(calls[0]?.init.body).toBe(file);
    expect(headersOf(calls[0]?.init)['Content-Type']).toBeUndefined();
  });

  it('surfaces the server text, else the status', async () => {
    stubFetch(new Response('bad signature', { status: 400 }));
    await expect(installBundle(new File([''], 'x.kmod'))).rejects.toThrow('bad signature');

    stubFetch(new Response('', { status: 413 }));
    await expect(installBundle(new File([''], 'x.kmod'))).rejects.toThrow('install failed (413)');

    stubFetch(unreadable(502));
    await expect(installBundle(new File([''], 'x.kmod'))).rejects.toThrow('install failed (502)');
  });
});
