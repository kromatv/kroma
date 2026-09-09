import { setSessionToken } from '@kromatv/client';
import { ModuleRegistry, SHARED_GLOBAL } from '@kromatv/module-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetRemote, isLoadedRemote, loadRuntimeRemotes, type RemoteLoaders } from './remotes';

const WIN = { location: { origin: 'http://localhost:3000' } };

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => impl(url)),
  );
}

function stubBrowserGlobals() {
  vi.stubGlobal('window', WIN);
}

function loaders(overrides: Partial<RemoteLoaders> = {}): RemoteLoaders {
  return {
    provideShared: async () => ({ react: { version: '19' } }),
    importRemote: vi.fn(async () => ({})),
    ...overrides,
  };
}

const oneRemote = (id: string) =>
  new Response(JSON.stringify([{ id, enabled: true, feRemote: { module: './remoteEntry.js' } }]), {
    status: 200,
  });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isLoadedRemote / forgetRemote', () => {
  it('reports false for a never-loaded module', () => {
    expect(isLoadedRemote('tv.kroma.ghost')).toBe(false);
  });

  it('forgetRemote is a no-op for an unknown id', () => {
    expect(() => forgetRemote('tv.kroma.ghost')).not.toThrow();
  });
});

describe('loadRuntimeRemotes (deterministic branches)', () => {
  it('is a no-op during SSR (no window)', async () => {
    await expect(loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('returns [] when discovery throws', async () => {
    stubBrowserGlobals();
    stubFetch(() => {
      throw new Error('network down');
    });
    await expect(loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('returns [] when /api/modules is not OK', async () => {
    stubBrowserGlobals();
    stubFetch(() => new Response('nope', { status: 500 }));
    await expect(loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('returns [] when no installed module ships a feRemote', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(JSON.stringify([{ id: 'tv.kroma.plain', enabled: true }]), { status: 200 }),
    );
    await expect(loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('skips a disabled module that ships a feRemote', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(
          JSON.stringify([{ id: 'tv.kroma.off', enabled: false, feRemote: { module: './P' } }]),
          { status: 200 },
        ),
    );
    await expect(loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });
});

describe('loadRuntimeRemotes (the host contract)', () => {
  it('returns [] and loads nothing when the shared modules cannot be provided', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('sharedFail'));
    const importRemote = vi.fn(async () => ({}));
    const result = await loadRuntimeRemotes(
      new ModuleRegistry(),
      loaders({ provideShared: async () => Promise.reject(new Error('no react')), importRemote }),
    );

    expect(result).toEqual([]);
    expect(isLoadedRemote('sharedFail')).toBe(false);
    expect(importRemote).not.toHaveBeenCalled();
  });

  it('fills the shared global before it imports the entry, from the server origin', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('order'));
    const seen: string[] = [];
    const importRemote = vi.fn(async (entry: string) => {
      seen.push(entry, JSON.stringify((globalThis as Record<string, unknown>)[SHARED_GLOBAL]));
      return { default: { id: 'order', version: '1.0.0' } };
    });
    await loadRuntimeRemotes(new ModuleRegistry(), loaders({ importRemote }));

    expect(seen[0]).toBe('http://localhost:3000/modules/order/remoteEntry.js');
    expect(seen[1]).toContain('"react"');
  });

  it('carries the session bearer into discovery', async () => {
    setSessionToken('tok123');
    stubBrowserGlobals();
    const inits: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        inits.push(init);
        return new Response('[]', { status: 200 });
      }),
    );
    await loadRuntimeRemotes(new ModuleRegistry(), loaders());
    const headers = inits[0]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer tok123');
    setSessionToken(undefined);
  });

  it('leaves a module the registry already holds alone', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('dup'));
    const reg = new ModuleRegistry();
    reg.register({ id: 'dup', version: '1.0.0' } as never);
    const importRemote = vi.fn(async () => ({ default: { id: 'dup', version: '1.0.0' } as never }));
    await expect(loadRuntimeRemotes(reg, loaders({ importRemote }))).resolves.toEqual([]);
  });

  it('registers a runtime remote and returns its id', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('runtimeDemo'));
    const importRemote = vi.fn(async () => ({
      default: { id: 'runtimeDemo', version: '1.0.0' } as never,
    }));

    const reg = new ModuleRegistry();
    const added = await loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added).toEqual(['runtimeDemo']);
    expect(reg.has('runtimeDemo')).toBe(true);
    expect(isLoadedRemote('runtimeDemo')).toBe(true);

    forgetRemote('runtimeDemo');
    expect(isLoadedRemote('runtimeDemo')).toBe(false);
  });

  it('keeps a module whose dependency arrives in the same batch, whatever the order', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(
          JSON.stringify([
            { id: 'needsBase', enabled: true, feRemote: { module: './remoteEntry.js' } },
            { id: 'base', enabled: true, feRemote: { module: './remoteEntry.js' } },
          ]),
          { status: 200 },
        ),
    );
    const importRemote = vi.fn(async (entry: string) =>
      entry.includes('needsBase')
        ? { default: { id: 'needsBase', version: '1.0.0', dependencies: { base: '*' } } as never }
        : { default: { id: 'base', version: '1.0.0' } as never },
    );

    const reg = new ModuleRegistry();
    const added = await loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added.sort()).toEqual(['base', 'needsBase']);
    expect(reg.order().map((m) => m.id)).toEqual(['base', 'needsBase']);
  });

  it('rolls back a remote whose deps do not resolve', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('runtimeBad'));
    const importRemote = vi.fn(async () => ({
      default: { id: 'runtimeBad', version: '1.0.0', dependencies: { nope: '*' } } as never,
    }));

    const reg = new ModuleRegistry();
    const added = await loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added).toEqual([]);
    expect(reg.has('runtimeBad')).toBe(false);
    expect(isLoadedRemote('runtimeBad')).toBe(false);
  });

  it('returns [] when a remote fails to load, and frees it for a retry', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('runtimeErr'));
    const importRemote = vi.fn(async () => Promise.reject(new Error('boom')));

    const reg = new ModuleRegistry();
    await expect(loadRuntimeRemotes(reg, loaders({ importRemote }))).resolves.toEqual([]);
    expect(isLoadedRemote('runtimeErr')).toBe(false);
  });
});
