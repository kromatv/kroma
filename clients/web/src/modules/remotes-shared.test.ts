import { type KromaModule, ModuleRegistry, SHARED_GLOBAL } from '@kromatv/module-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeRemotes, type RemoteLoaders } from './remotes';

const listed = (...ids: string[]) =>
  vi.fn(async () =>
    ids.map((id) => ({ id, enabled: true, feRemote: { module: './remoteEntry.js' } }) as never),
  );

const module = (id: string, extra: Partial<KromaModule> = {}) => ({
  default: { id, version: '1.0.0', ...extra },
});

function loaders(overrides: Partial<RemoteLoaders> = {}): RemoteLoaders {
  return {
    provideShared: vi.fn(async () => ({ react: 'full react', '@kromatv/ui/kit': 'the kit' })),
    provideEntryShared: vi.fn(async () => ({ '@kromatv/module-sdk': 'the light sdk' })),
    readDeclaration: vi.fn(async () => ({ '@kromatv/module-sdk': ['defineModule'] })),
    importRemote: vi.fn(async (entry: string) => module(entry.split('/').at(-2) ?? '')),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  Reflect.deleteProperty(globalThis, SHARED_GLOBAL);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, SHARED_GLOBAL);
});

describe('the entries a host loads', () => {
  it('are handed only what their builds declared they read', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn'));
    const given = loaders();

    const added = await remotes.loadRuntimeRemotes(new ModuleRegistry(), given);

    expect(added).toEqual(['vpn']);
    expect(given.provideEntryShared).toHaveBeenCalledWith([
      { '@kromatv/module-sdk': ['defineModule'] },
    ]);
    expect(given.provideShared).not.toHaveBeenCalled();
    expect(Reflect.get(globalThis, SHARED_GLOBAL)).toEqual({
      '@kromatv/module-sdk': 'the light sdk',
    });
  });

  it('read the declaration from beside the entry on the server origin', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn'));
    const given = loaders();

    await remotes.loadRuntimeRemotes(new ModuleRegistry(), given);

    expect(given.readDeclaration).toHaveBeenCalledWith(
      'http://localhost:3000/modules/vpn/shared.json',
    );
  });

  it('all get the full set when one of them declares nothing', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn', 'legacy'));
    const given = loaders({
      readDeclaration: vi.fn(async (url: string) =>
        url.includes('legacy') ? null : { react: ['lazy'] },
      ),
    });

    await remotes.loadRuntimeRemotes(new ModuleRegistry(), given);

    expect(given.provideShared).toHaveBeenCalledOnce();
    expect(given.provideEntryShared).not.toHaveBeenCalled();
  });

  it('get the full set before a module that runs code at start is registered', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('notes'));
    const registry = new ModuleRegistry();
    const given = loaders({ importRemote: vi.fn(async () => module('notes', { setup() {} })) });

    await remotes.loadRuntimeRemotes(registry, given);

    expect(given.provideShared).toHaveBeenCalledOnce();
    expect(registry.has('notes')).toBe(true);
    expect(Reflect.get(Object(Reflect.get(globalThis, SHARED_GLOBAL)), '@kromatv/ui/kit')).toBe(
      'the kit',
    );
  });

  it('come from the list the host gave, without a fetch of their own', async () => {
    const list = listed('vpn');
    const remotes = createRuntimeRemotes(undefined, list);

    await remotes.loadRuntimeRemotes(new ModuleRegistry(), loaders());

    expect(list).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('ready', () => {
  it('loads the full set once and answers the same promise every call', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn'));
    const given = loaders();
    await remotes.loadRuntimeRemotes(new ModuleRegistry(), given);

    const first = remotes.ready();
    await first;

    expect(remotes.ready()).toBe(first);
    expect(given.provideShared).toHaveBeenCalledOnce();
  });

  it('puts the real modules over the stand-ins an entry was handed', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn'));
    const given = loaders({
      provideShared: vi.fn(async () => ({ '@kromatv/module-sdk': 'the real sdk' })),
    });
    await remotes.loadRuntimeRemotes(new ModuleRegistry(), given);

    await remotes.ready();

    expect(Reflect.get(globalThis, SHARED_GLOBAL)).toEqual({
      '@kromatv/module-sdk': 'the real sdk',
    });
  });

  it('settles even when the full set cannot load', async () => {
    const remotes = createRuntimeRemotes(undefined, listed('vpn'));
    await remotes.loadRuntimeRemotes(
      new ModuleRegistry(),
      loaders({ provideShared: vi.fn(async () => Promise.reject(new Error('offline'))) }),
    );

    await expect(remotes.ready()).resolves.toBeUndefined();
  });
});
