import { beforeEach, describe, expect, it, vi } from 'vitest';
import { androidAppId } from './app-id';

const appJson = vi.hoisted(() => ({ json: '' }));
vi.mock('node:fs', () => ({
  readFileSync: () => {
    if (appJson.json === '') throw new Error('ENOENT');
    return appJson.json;
  },
}));
vi.mock('../../root', () => ({ root: '/kroma' }));

beforeEach(() => {
  appJson.json = '';
});

describe('androidAppId', () => {
  it('reads the package the Expo config declares', () => {
    appJson.json = JSON.stringify({ expo: { android: { package: 'tv.kroma.tv' } } });

    expect(androidAppId()).toBe('tv.kroma.tv');
  });

  it('falls back to the published package on a checkout with no shell in it', () => {
    expect(androidAppId()).toBe('tv.kroma.tv');
  });

  it('falls back to the published package when the config names none', () => {
    appJson.json = JSON.stringify({ expo: { ios: { bundleIdentifier: 'tv.kroma.mobile' } } });

    expect(androidAppId()).toBe('tv.kroma.tv');
  });
});
