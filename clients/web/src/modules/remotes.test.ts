import { ModuleRegistry, SHARED_GLOBAL } from '@kromatv/module-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeRemotes, type RemoteLoaders } from './remotes';

const WIN = { location: { origin: 'http://localhost:3000' } };

const listing = (...modules: object[]) => vi.fn(async () => modules as never);

const withRemote = (id: string) => ({
  id,
  enabled: true,
  feRemote: { module: './remoteEntry.js' },
});

const oneRemote = (id: string) => listing(withRemote(id));

const nothing = listing();

function stubBrowserGlobals() {
  vi.stubGlobal('window', WIN);
}

function loaders(overrides: Partial<RemoteLoaders> = {}): RemoteLoaders {
  return {
    provideShared: async () => ({ react: { version: '19' } }),
    provideEntryShared: async () => ({}),
    readDeclaration: async () => null,
    importRemote: vi.fn(async () => ({})),
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isLoadedRemote / forgetRemote', () => {
  it('reports false for a never-loaded module', () => {
    const remotes = createRuntimeRemotes(nothing);
    expect(remotes.isLoadedRemote('tv.kroma.ghost')).toBe(false);
  });

  it('forgetRemote is a no-op for an unknown id', () => {
    const remotes = createRuntimeRemotes(nothing);
    expect(() => remotes.forgetRemote('tv.kroma.ghost')).not.toThrow();
  });
});

describe('loadRuntimeRemotes (deterministic branches)', () => {
  it('is a no-op during SSR (no window)', async () => {
    const remotes = createRuntimeRemotes(oneRemote('ssr'));
    await expect(remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('returns [] when discovery throws', async () => {
    const remotes = createRuntimeRemotes(
      vi.fn(async () => Promise.reject(new Error('network down'))),
    );
    stubBrowserGlobals();
    await expect(remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('returns [] when no installed module ships a frontend', async () => {
    const remotes = createRuntimeRemotes(listing({ id: 'tv.kroma.plain', enabled: true }));
    stubBrowserGlobals();
    await expect(remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });

  it('skips a disabled module that ships a frontend', async () => {
    const remotes = createRuntimeRemotes(
      listing({
        id: 'tv.kroma.off',
        enabled: false,
        frontend: { revision: '3f2a9c1d8e7b6a50' },
      }),
    );
    stubBrowserGlobals();
    await expect(remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders())).resolves.toEqual([]);
  });
});

describe('loadRuntimeRemotes (the host contract)', () => {
  it('returns [] and loads nothing when the shared modules cannot be provided', async () => {
    const remotes = createRuntimeRemotes(oneRemote('sharedFail'));
    stubBrowserGlobals();
    const importRemote = vi.fn(async () => ({}));
    const result = await remotes.loadRuntimeRemotes(
      new ModuleRegistry(),
      loaders({ provideShared: async () => Promise.reject(new Error('no react')), importRemote }),
    );

    expect(result).toEqual([]);
    expect(remotes.isLoadedRemote('sharedFail')).toBe(false);
    expect(importRemote).not.toHaveBeenCalled();
  });

  it('fills the shared global before it imports the entry, from the server origin', async () => {
    const remotes = createRuntimeRemotes(oneRemote('order'));
    stubBrowserGlobals();
    const seen: string[] = [];
    const importRemote = vi.fn(async (entry: string) => {
      seen.push(entry, JSON.stringify(Reflect.get(globalThis, SHARED_GLOBAL)));
      return { default: { id: 'order', version: '1.0.0' } };
    });
    await remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders({ importRemote }));

    expect(seen[0]).toBe('http://localhost:3000/modules/order/remoteEntry.js');
    expect(seen[1]).toContain('"react"');
  });

  it('leaves a module the registry already holds alone', async () => {
    const remotes = createRuntimeRemotes(oneRemote('dup'));
    stubBrowserGlobals();
    const reg = new ModuleRegistry();
    reg.register({ id: 'dup', version: '1.0.0' } as never);
    const importRemote = vi.fn(async () => ({ default: { id: 'dup', version: '1.0.0' } as never }));
    await expect(remotes.loadRuntimeRemotes(reg, loaders({ importRemote }))).resolves.toEqual([]);
  });

  it('registers a runtime remote and returns its id', async () => {
    const remotes = createRuntimeRemotes(oneRemote('runtimeDemo'));
    stubBrowserGlobals();
    const importRemote = vi.fn(async () => ({
      default: { id: 'runtimeDemo', version: '1.0.0' } as never,
    }));

    const reg = new ModuleRegistry();
    const added = await remotes.loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added).toEqual(['runtimeDemo']);
    expect(reg.has('runtimeDemo')).toBe(true);
    expect(remotes.isLoadedRemote('runtimeDemo')).toBe(true);

    remotes.forgetRemote('runtimeDemo');
    expect(remotes.isLoadedRemote('runtimeDemo')).toBe(false);
  });

  it('keeps a module whose dependency arrives in the same batch, whatever the order', async () => {
    const remotes = createRuntimeRemotes(listing(withRemote('needsBase'), withRemote('base')));
    stubBrowserGlobals();
    const importRemote = vi.fn(async (entry: string) =>
      entry.includes('needsBase')
        ? { default: { id: 'needsBase', version: '1.0.0', dependencies: { base: '*' } } as never }
        : { default: { id: 'base', version: '1.0.0' } as never },
    );

    const reg = new ModuleRegistry();
    const added = await remotes.loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added.sort()).toEqual(['base', 'needsBase']);
    expect(reg.order().map((m) => m.id)).toEqual(['base', 'needsBase']);
  });

  it('rolls back a remote whose deps do not resolve', async () => {
    const remotes = createRuntimeRemotes(oneRemote('runtimeBad'));
    stubBrowserGlobals();
    const importRemote = vi.fn(async () => ({
      default: { id: 'runtimeBad', version: '1.0.0', dependencies: { nope: '*' } } as never,
    }));

    const reg = new ModuleRegistry();
    const added = await remotes.loadRuntimeRemotes(reg, loaders({ importRemote }));
    expect(added).toEqual([]);
    expect(reg.has('runtimeBad')).toBe(false);
    expect(remotes.isLoadedRemote('runtimeBad')).toBe(false);
  });

  it('returns [] when a remote fails to load, and frees it for a retry', async () => {
    const remotes = createRuntimeRemotes(oneRemote('runtimeErr'));
    stubBrowserGlobals();
    const importRemote = vi.fn(async () => Promise.reject(new Error('boom')));

    const reg = new ModuleRegistry();
    await expect(remotes.loadRuntimeRemotes(reg, loaders({ importRemote }))).resolves.toEqual([]);
    expect(remotes.isLoadedRemote('runtimeErr')).toBe(false);
  });
});

it('loads the same remote into independent registries for different hosts', async () => {
  stubBrowserGlobals();
  const a = createRuntimeRemotes(oneRemote('owned'));
  const b = createRuntimeRemotes(oneRemote('owned'));
  const regA = new ModuleRegistry();
  const regB = new ModuleRegistry();
  const imports = vi.fn(async () => ({ default: { id: 'owned', version: '1.0.0' } }));
  await a.loadRuntimeRemotes(regA, loaders({ importRemote: imports }));
  await b.loadRuntimeRemotes(regB, loaders({ importRemote: imports }));
  expect(regA.has('owned')).toBe(true);
  expect(regB.has('owned')).toBe(true);
  a.forgetRemote('owned');
  expect(b.isLoadedRemote('owned')).toBe(true);
  expect(imports).toHaveBeenCalledTimes(2);
});

it('does not adopt a remote that finishes importing after its host leaves', async () => {
  stubBrowserGlobals();
  const remotes = createRuntimeRemotes(oneRemote('late'));
  const registry = new ModuleRegistry();
  let resolveImport: (value: { default: { id: string; version: string } }) => void = () => {};
  const importing = new Promise<{ default: { id: string; version: string } }>((resolve) => {
    resolveImport = resolve;
  });
  const importRemote = vi.fn(() => importing);
  const loaded = remotes.loadRuntimeRemotes(registry, loaders({ importRemote }));
  await vi.waitFor(() => expect(importRemote).toHaveBeenCalledOnce());
  remotes.dispose();
  resolveImport({ default: { id: 'late', version: '1.0.0' } });
  await expect(loaded).resolves.toEqual([]);
  expect(registry.ids()).toEqual([]);
});
