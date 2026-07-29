// What a television calls itself on the wire. The three runtimes this bundle
// executes on answer differently, and only one of them - the browser shell - is
// allowed to say nothing: the other two went out as `KROMA/1 CFNetwork/…` and
// `okhttp/…`, which the account page could only list as an unknown desktop.

import { clientUserAgent } from '@kroma/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBuildInfo } from '#tv/app/clientBuild';

const platform = vi.hoisted(() => ({
  current: { OS: 'web' } as Record<string, unknown>,
}));
vi.mock('react-native', () => ({
  get Platform() {
    return platform.current;
  },
}));

import { makeClient, tvIdentity } from './apiClient';

beforeEach(() => {
  setBuildInfo({ version: '0.1.35' });
});

describe('tvIdentity', () => {
  it('names an Apple TV by its platform, which is the only model there is', () => {
    platform.current = {
      OS: 'ios',
      isTV: true,
      constants: { systemName: 'tvOS', osVersion: '26.0' },
    };
    expect(tvIdentity()).toEqual({ version: '0.1.35', model: 'Apple TV', os: 'tvOS 26.0' });
    expect(clientUserAgent(tvIdentity() as never)).toBe('Kroma/0.1.35 (Apple TV; tvOS 26.0)');
  });

  it('names an Android television by its hardware, and says it is a television', () => {
    platform.current = {
      OS: 'android',
      isTV: true,
      constants: { Model: 'BRAVIA 4K', Release: '14', uiMode: 'tv' },
    };
    // "Android TV" rather than "Android" is what keeps the account page from
    // listing a television as a very large phone.
    expect(tvIdentity()).toEqual({ version: '0.1.35', model: 'BRAVIA 4K', os: 'Android TV 14' });
  });

  it('says nothing in a browser shell, which owns its own User-Agent', () => {
    platform.current = { OS: 'web' };
    expect(tvIdentity()).toBeNull();
  });
});

describe('makeClient', () => {
  /** Every request the next client makes, as headers. */
  function recorded(): Headers[] {
    const seen: Headers[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen.push(new Headers(init?.headers));
        return new Response('{}', { headers: { 'content-type': 'application/json' } });
      }),
    );
    return seen;
  }

  it('puts the television name on the requests a native shell makes', async () => {
    platform.current = {
      OS: 'ios',
      isTV: true,
      constants: { systemName: 'tvOS', osVersion: '26.0' },
    };
    const seen = recorded();
    await makeClient('http://kroma.test').health();
    expect(seen[0]?.get('User-Agent')).toBe('Kroma/0.1.35 (Apple TV; tvOS 26.0)');
    vi.unstubAllGlobals();
  });

  it('leaves the header alone in a browser shell', async () => {
    platform.current = { OS: 'web' };
    const seen = recorded();
    await makeClient('http://kroma.test').health();
    expect(seen[0]?.get('User-Agent')).toBeNull();
    vi.unstubAllGlobals();
  });
});
