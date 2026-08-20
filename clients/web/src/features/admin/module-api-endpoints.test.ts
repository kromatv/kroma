import { describe, expect, it } from 'vitest';
import {
  calls,
  headersOf,
  installHarness,
  stubFetch,
  unreadable,
} from '#web/features/admin/module-api.fixture';
import {
  type AdminModule,
  fetchAdminModules,
  fetchInstallPlan,
  fetchStoreCatalog,
  installBundle,
  installById,
  previewRegistry,
  setModuleEnabled,
  UninstallConflictError,
  uninstallModule,
  updateModules,
} from './module-api';

installHarness();

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

    calls.length = 0;
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

    calls.length = 0;
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

    calls.length = 0;
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
