import { describe, expect, it } from 'vitest';
import { nativeWakeHint } from './wake-hint';

const installed = { android: { package: 'tv.kroma.app' } };

describe('what a native set says about reaching itself', () => {
  it('says the app id and the address', () => {
    expect(nativeWakeHint({ expoConfig: installed, address: '192.168.1.20' })).toEqual({
      appId: 'tv.kroma.app',
      address: '192.168.1.20',
    });
  });

  it('leaves out an address the set does not know', () => {
    expect(nativeWakeHint({ expoConfig: installed, address: null }).address).toBeUndefined();
  });

  it('leaves out an app id when the config names no Android package', () => {
    expect(nativeWakeHint({ expoConfig: {}, address: null }).appId).toBeUndefined();
  });

  it('leaves out an app id when there is no config', () => {
    expect(nativeWakeHint({ expoConfig: null, address: null }).appId).toBeUndefined();
  });
});
