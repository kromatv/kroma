import { ModuleRegistry } from '@kroma/module-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Intercept the dynamic MF runtime import so the tests never touch the real one.
vi.mock('@module-federation/runtime', () => ({
  init: vi.fn(),
  registerRemotes: vi.fn(),
  loadRemote: vi.fn(),
}));

import { setSessionToken } from '@kroma/core';
import * as mfRuntime from '@module-federation/runtime';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { forgetRemote, isLoadedRemote, loadRuntimeRemotes } from './remotes';

const WIN = { location: { origin: 'http://localhost:3000' } };

interface FakeLink {
  rel?: string;
  href?: string;
  dataset: Record<string, string>;
  onerror?: () => void;
  remove: ReturnType<typeof vi.fn>;
}

const createdLinks: FakeLink[] = [];

function stubFetch(impl: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => impl(url)),
  );
}

function stubBrowserGlobals() {
  vi.stubGlobal('window', WIN);
  vi.stubGlobal('document', {
    createElement: () => {
      const link: FakeLink = { dataset: {}, remove: vi.fn() };
      createdLinks.push(link);
      return link as unknown;
    },
    head: { appendChild: () => undefined },
  });
}

beforeEach(() => {
  createdLinks.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(mfRuntime.loadRemote).mockReset();
  vi.mocked(mfRuntime.registerRemotes).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isLoadedRemote / forgetRemote', () => {
  it('reports false for a never-loaded module (mfName maps dots to underscores)', () => {
    expect(isLoadedRemote('tv.kroma.ghost')).toBe(false);
  });

  it('forgetRemote is a no-op for an unknown id', () => {
    expect(() => forgetRemote('tv.kroma.ghost')).not.toThrow();
  });
});

describe('loadRuntimeRemotes (deterministic branches)', () => {
  it('is a no-op during SSR (no window)', async () => {
    // window is not stubbed here => typeof window === "undefined".
    const reg = new ModuleRegistry();
    await expect(loadRuntimeRemotes(reg)).resolves.toEqual([]);
  });

  it('returns [] when discovery throws', async () => {
    stubBrowserGlobals();
    stubFetch(() => {
      throw new Error('network down');
    });
    await expect(loadRuntimeRemotes(new ModuleRegistry())).resolves.toEqual([]);
  });

  it('returns [] when /api/modules is not OK', async () => {
    stubBrowserGlobals();
    stubFetch(() => new Response('nope', { status: 500 }));
    await expect(loadRuntimeRemotes(new ModuleRegistry())).resolves.toEqual([]);
  });

  it('returns [] when no installed module ships a feRemote', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(JSON.stringify([{ id: 'tv.kroma.plain', enabled: true }]), { status: 200 }),
    );
    await expect(loadRuntimeRemotes(new ModuleRegistry())).resolves.toEqual([]);
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
    await expect(loadRuntimeRemotes(new ModuleRegistry())).resolves.toEqual([]);
  });
});

describe('loadRuntimeRemotes (before anything has initialised federation)', () => {
  const oneRemote = (id: string) =>
    new Response(JSON.stringify([{ id, enabled: true, feRemote: { module: './P' } }]), {
      status: 200,
    });

  it('returns [] when the federation runtime refuses to initialise', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('initFail'));
    vi.mocked(mfRuntime.init).mockImplementationOnce(() => {
      throw new Error('shared scope clash');
    });
    await expect(loadRuntimeRemotes(new ModuleRegistry())).resolves.toEqual([]);
    expect(isLoadedRemote('initFail')).toBe(false);
    expect(mfRuntime.registerRemotes).not.toHaveBeenCalled();
  });

  it('shares the host React and ReactDOM as singletons', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('sharedReact'));
    vi.mocked(mfRuntime.loadRemote).mockRejectedValue(new Error('boom'));
    await loadRuntimeRemotes(new ModuleRegistry());

    const config = vi.mocked(mfRuntime.init).mock.calls.at(-1)?.[0] as unknown as {
      shared: Record<string, { lib: () => unknown; shareConfig: { singleton: boolean } }>;
    };
    expect(config.shared.react?.lib()).toBe(React);
    expect(config.shared['react-dom']?.lib()).toBe(ReactDOM);
    expect(config.shared.react?.shareConfig.singleton).toBe(true);
  });

  it('links the remote stylesheet once, and drops it when the module ships none', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('styled'));
    vi.mocked(mfRuntime.loadRemote).mockRejectedValue(new Error('boom'));
    await loadRuntimeRemotes(new ModuleRegistry());

    expect(createdLinks).toHaveLength(1);
    const link = createdLinks[0];
    expect(link?.rel).toBe('stylesheet');
    expect(link?.href).toBe('http://localhost:3000/modules/styled/style.css');
    expect(link?.dataset.kromaModuleStyles).toBe('');
    link?.onerror?.();
    expect(link?.remove).toHaveBeenCalledTimes(1);

    await loadRuntimeRemotes(new ModuleRegistry());
    expect(createdLinks).toHaveLength(1);
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
    await loadRuntimeRemotes(new ModuleRegistry());
    const headers = inits[0]?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer tok123');
    setSessionToken(undefined);
  });

  it('leaves a module the registry already holds alone', async () => {
    stubBrowserGlobals();
    stubFetch(() => oneRemote('dup'));
    const reg = new ModuleRegistry();
    reg.register({ id: 'dup', version: '1.0.0' } as never);
    vi.mocked(mfRuntime.loadRemote).mockResolvedValue({
      default: { id: 'dup', version: '1.0.0' },
    });
    await expect(loadRuntimeRemotes(reg)).resolves.toEqual([]);
  });
});

describe('loadRuntimeRemotes (federation path)', () => {
  it('registers a runtime remote and returns its id', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(
          JSON.stringify([{ id: 'runtimeDemo', enabled: true, feRemote: { module: './Widget' } }]),
          { status: 200 },
        ),
    );
    vi.mocked(mfRuntime.loadRemote).mockResolvedValue({
      default: { id: 'runtimeDemo', version: '1.0.0' },
    });

    const reg = new ModuleRegistry();
    const added = await loadRuntimeRemotes(reg);
    expect(added).toEqual(['runtimeDemo']);
    expect(reg.has('runtimeDemo')).toBe(true);
    expect(isLoadedRemote('runtimeDemo')).toBe(true);
    expect(mfRuntime.registerRemotes).toHaveBeenCalled();

    forgetRemote('runtimeDemo');
    expect(isLoadedRemote('runtimeDemo')).toBe(false);
  });

  it('rolls back a remote whose deps do not resolve', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(
          JSON.stringify([{ id: 'runtimeBad', enabled: true, feRemote: { module: './P' } }]),
          { status: 200 },
        ),
    );
    vi.mocked(mfRuntime.loadRemote).mockResolvedValue({
      default: { id: 'runtimeBad', version: '1.0.0', dependsOn: { nope: '*' } },
    });

    const reg = new ModuleRegistry();
    const added = await loadRuntimeRemotes(reg);
    expect(added).toEqual([]);
    expect(reg.has('runtimeBad')).toBe(false);
    expect(isLoadedRemote('runtimeBad')).toBe(false); // freed for a later retry
  });

  it('returns [] when a remote fails to load', async () => {
    stubBrowserGlobals();
    stubFetch(
      () =>
        new Response(
          JSON.stringify([{ id: 'runtimeErr', enabled: true, feRemote: { module: './P' } }]),
          { status: 200 },
        ),
    );
    vi.mocked(mfRuntime.loadRemote).mockRejectedValue(new Error('boom'));

    const reg = new ModuleRegistry();
    await expect(loadRuntimeRemotes(reg)).resolves.toEqual([]);
    expect(isLoadedRemote('runtimeErr')).toBe(false);
  });
});
