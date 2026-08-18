import type { ComponentType } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getVlcPlane,
  registerVlcPlane,
  type VlcPlaneProps,
  vlcAvailable,
} from '#tv/features/playback/player/vlcPlane';

const Plane = (() => null) as unknown as ComponentType<VlcPlaneProps>;

afterEach(() => registerVlcPlane(null));

describe('the libVLC plane registry', () => {
  // Registration, not a platform check, is what answers this: a shell that ships
  // no native module registers nothing and the engine stays out of its picker.
  it('reports the engine unavailable until a shell hands one over', () => {
    expect(getVlcPlane()).toBeNull();
    expect(vlcAvailable()).toBe(false);
    registerVlcPlane(Plane);
    expect(getVlcPlane()).toBe(Plane);
    expect(vlcAvailable()).toBe(true);
  });

  it('lets a shell take it back', () => {
    registerVlcPlane(Plane);
    registerVlcPlane(null);
    expect(getVlcPlane()).toBeNull();
    expect(vlcAvailable()).toBe(false);
  });
});
