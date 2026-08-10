// Native shells send a User-Agent that names nothing (`KROMA/1 CFNetwork/…`,
// `okhttp/…`); only the browser shell is allowed to say nothing itself.

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

  it('does not claim to be a television when the same bundle runs on a phone', () => {
    platform.current = {
      OS: 'ios',
      isTV: false,
      constants: { systemName: 'iOS', osVersion: '18.2' },
    };
    expect(tvIdentity()).toEqual({ version: '0.1.35', model: 'Apple device', os: 'iOS 18.2' });
  });

  it('leaves "TV" off an Android device that is not one', () => {
    platform.current = {
      OS: 'android',
      isTV: false,
      constants: { Model: 'Pixel 8', Release: '14', uiMode: 'normal' },
    };
    expect(tvIdentity()).toEqual({ version: '0.1.35', model: 'Pixel 8', os: 'Android 14' });
  });

  it('says nothing in a browser shell, which owns its own User-Agent', () => {
    platform.current = { OS: 'web' };
    expect(tvIdentity()).toBeNull();
  });
});

describe('makeClient', () => {
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
