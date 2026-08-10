// Contract between this app and the account page: the phone writes a
// User-Agent, the web client reads it back — both halves asserted together.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const hardware = vi.hoisted(() => ({
  deviceName: 'iPhone' as string | null,
  modelName: 'iPhone 17 Pro' as string | null,
}));
vi.mock('expo-device', () => ({
  get deviceName() {
    return hardware.deviceName;
  },
  get modelName() {
    return hardware.modelName;
  },
  osName: 'iOS',
  osVersion: '26.0',
}));
vi.mock('#mobile/lib/buildInfo', () => ({ buildInfo: { version: '0.1.3' } }));

import { Platform } from 'react-native';
import { deviceInfo } from '#web/shared/lib/device';
import { deviceLabel, makeClient, userAgent } from './device';

beforeEach(() => {
  hardware.deviceName = 'iPhone';
  hardware.modelName = 'iPhone 17 Pro';
});

describe('this device, as a server sees it', () => {
  it('names itself by model and platform', () => {
    expect(userAgent()).toBe('Kroma/0.1.3 (iPhone 17 Pro; iOS 26.0)');
  });

  it('is read back by the session list as the device it is', () => {
    expect(deviceInfo(userAgent(), 'Unknown device')).toEqual({
      label: 'iPhone 17 Pro · iOS',
      kind: 'mobile',
    });
  });

  it('labels the push subscription with the owner name and the model', () => {
    expect(deviceLabel()).toBe('iPhone (iPhone 17 Pro)');
  });

  it('says the model once when the owner never renamed the phone', () => {
    hardware.deviceName = 'iPhone 17 Pro';
    expect(deviceLabel()).toBe('iPhone 17 Pro');
  });

  it('falls back to the platform when the model is unknown', () => {
    hardware.modelName = null;
    expect(deviceLabel()).toBe(`iPhone (${Platform.OS})`);
  });

  it('sends the name on every request a client makes', async () => {
    const seen: Headers[] = [];
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return new Response('{}', { headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchSpy);

    await makeClient('http://kroma.test').health();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.get('User-Agent')).toBe('Kroma/0.1.3 (iPhone 17 Pro; iOS 26.0)');
    vi.unstubAllGlobals();
  });
});
