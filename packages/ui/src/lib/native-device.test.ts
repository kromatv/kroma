import { beforeEach, describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({
  os: 'tizen' as string,
  isTV: true,
  constants: {} as unknown,
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
    get isTV() {
      return rn.isTV;
    },
    get constants() {
      return rn.constants;
    },
  },
}));

import { nativeDevice } from './native-device';

beforeEach(() => {
  rn.os = 'tizen';
  rn.isTV = true;
});

describe('nativeDevice', () => {
  it('names a samsung set by its model and its tizen release', () => {
    rn.constants = { Model: 'QE65QN90A', Release: '6.5', uiMode: 'tv', Brand: 'Samsung' };

    expect(nativeDevice()).toEqual({ model: 'QE65QN90A', os: 'Tizen 6.5' });
  });

  it('still says tizen when the set reports neither', () => {
    rn.constants = { Model: '', Release: 7 };

    expect(nativeDevice()).toEqual({ model: 'Samsung TV', os: 'Tizen' });
  });

  it('still says tizen when the set reports no constants at all', () => {
    rn.constants = undefined;

    expect(nativeDevice()).toEqual({ model: 'Samsung TV', os: 'Tizen' });
  });

  it('names an lg set by its model and its webos release', () => {
    rn.os = 'webos';
    rn.constants = { Model: 'OLED55C4', Release: '9.2.0', uiMode: 'tv', Brand: 'LG' };

    expect(nativeDevice()).toEqual({ model: 'OLED55C4', os: 'webOS 9.2.0' });
  });

  it('still says webos when the set reports no constants at all', () => {
    rn.os = 'webos';
    rn.constants = undefined;

    expect(nativeDevice()).toEqual({ model: 'LG TV', os: 'webOS' });
  });

  it('names an android tv by its own constants', () => {
    rn.os = 'android';
    rn.constants = { Model: 'BRAVIA 4K', Release: '14', uiMode: 'tv' };

    expect(nativeDevice()).toEqual({ model: 'BRAVIA 4K', os: 'Android TV 14' });
  });

  it('names an apple tv by its system', () => {
    rn.os = 'ios';
    rn.constants = { systemName: 'tvOS', osVersion: '26.0' };

    expect(nativeDevice()).toEqual({ model: 'Apple TV', os: 'tvOS 26.0' });
  });

  it('leaves a browser to its own user agent', () => {
    rn.os = 'web';

    expect(nativeDevice()).toBeNull();
  });
});
