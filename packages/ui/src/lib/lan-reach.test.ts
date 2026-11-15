import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  lanPermission,
  mediaFollowsDirectRoute,
  onOnline,
  withLocalAddressSpace,
} from './lan-reach';

afterEach(() => {
  vi.unstubAllGlobals();
});

function onPage(protocol: string, query?: (descriptor: { name: string }) => Promise<unknown>) {
  vi.stubGlobal('location', { protocol });
  vi.stubGlobal('navigator', query ? { permissions: { query } } : {});
}

describe('lanPermission', () => {
  it('is granted anywhere but an https page', async () => {
    onPage('file:');

    await expect(lanPermission()).resolves.toBe('granted');
  });

  it('reads the local-network permission on an https page, asking by its own name', async () => {
    const query = vi.fn(async () => ({ state: 'prompt' }));
    onPage('https:', query);

    await expect(lanPermission()).resolves.toBe('prompt');
    expect(query).toHaveBeenCalledWith({ name: 'local-network' });
  });

  it('is unsupported where the browser has no such permission', async () => {
    onPage('https:', async () => {
      throw new TypeError('not a permission name');
    });
    const without = lanPermission();
    onPage('https:');

    await expect(without).resolves.toBe('unsupported');
    await expect(lanPermission()).resolves.toBe('unsupported');
  });
});

describe('withLocalAddressSpace', () => {
  it('names the local address space on a request to a private address, and only there', async () => {
    onPage('https:');
    const fetchFn = vi.fn(async () => new Response());
    const lanFetch = withLocalAddressSpace(fetchFn as unknown as typeof fetch);

    await lanFetch('http://192.168.1.2:4040/api/health', { method: 'GET' });
    await lanFetch('https://kroma.example/api/health');

    expect(fetchFn.mock.calls).toEqual([
      ['http://192.168.1.2:4040/api/health', { method: 'GET', targetAddressSpace: 'local' }],
      ['https://kroma.example/api/health', undefined],
    ]);
  });

  it('hands back the fetch it was given anywhere but an https page', () => {
    const fetchFn = vi.fn(async () => new Response()) as unknown as typeof fetch;
    onPage('file:');
    const packaged = withLocalAddressSpace(fetchFn);
    onPage('http:');
    const onHttp = withLocalAddressSpace(fetchFn);
    vi.unstubAllGlobals();
    const native = withLocalAddressSpace(fetchFn);

    expect(packaged).toBe(fetchFn);
    expect(onHttp).toBe(fetchFn);
    expect(native).toBe(fetchFn);
  });
});

describe('onOnline', () => {
  it('hears the browser come back online until it stops listening', () => {
    const window = new EventTarget();
    vi.stubGlobal('addEventListener', window.addEventListener.bind(window));
    vi.stubGlobal('removeEventListener', window.removeEventListener.bind(window));
    const listener = vi.fn();
    const stop = onOnline(listener);

    window.dispatchEvent(new Event('online'));
    stop();
    window.dispatchEvent(new Event('online'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never calls on a platform that has no such event', () => {
    vi.stubGlobal('addEventListener', undefined);

    expect(onOnline(vi.fn())).toBeTypeOf('function');
  });
});

describe('mediaFollowsDirectRoute', () => {
  it('lets media follow the route everywhere but an https page', () => {
    onPage('https:');
    const onHttps = mediaFollowsDirectRoute();
    onPage('file:');

    expect(onHttps).toBe(false);
    expect(mediaFollowsDirectRoute()).toBe(true);
  });
});
