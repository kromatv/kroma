import { describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({
  os: 'android' as 'ios' | 'android' | 'tizen' | 'webos' | 'web',
}));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
  },
}));

import {
  nativeBufferBudget,
  nativePlayerDevice,
  nativePlayerOs,
  nativePlayerPlane,
} from './native-player';

describe('nativeBufferBudget', () => {
  it('bounds the android buffer well under a 48 MB heap', () => {
    rn.os = 'android';

    const budget = nativeBufferBudget();

    expect(budget?.maxBufferBytes).toBe(16 * 1024 * 1024);
    expect(budget?.preferredForwardBufferDuration).toBe(20);
  });

  it('leaves apple to its own defaults', () => {
    rn.os = 'ios';

    expect(nativeBufferBudget()).toBeNull();
  });
});

describe('the native player', () => {
  it('names a samsung set by its own player, never by android', () => {
    rn.os = 'tizen';

    expect(nativePlayerOs()).toBe('tizen');
    expect(nativePlayerDevice()).toBe('Samsung TV');
    expect(nativePlayerPlane()).toBe('capi-media-player');
  });

  it('names an lg set by its own player, never by android', () => {
    rn.os = 'webos';

    expect(nativePlayerOs()).toBe('webos');
    expect(nativePlayerDevice()).toBe('LG TV');
    expect(nativePlayerPlane()).toBe('uMediaServer');
    expect(nativeBufferBudget()).toBeNull();
  });

  it('names an apple tv and an android tv by theirs', () => {
    rn.os = 'ios';
    expect([nativePlayerOs(), nativePlayerDevice(), nativePlayerPlane()]).toEqual([
      'ios',
      'Apple TV',
      'AVPlayer',
    ]);

    rn.os = 'android';
    expect([nativePlayerOs(), nativePlayerDevice(), nativePlayerPlane()]).toEqual([
      'android',
      'Android TV',
      'media3',
    ]);
  });

  it('leaves a samsung set its own buffer', () => {
    rn.os = 'tizen';

    expect(nativeBufferBudget()).toBeNull();
  });
});
