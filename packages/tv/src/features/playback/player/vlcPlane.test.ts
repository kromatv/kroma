import type { ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { type VlcPlaneProps, vlcBackendFor } from './vlcBackend';
import { getVlcPlane, vlcAvailable } from './vlcPlane';

const Plane: ComponentType<VlcPlaneProps> = () => null;

describe('immutable VLC platform adapters', () => {
  it('keeps VLC unavailable in browser shells', () => {
    expect(getVlcPlane()).toBeNull();
    expect(vlcAvailable()).toBe(false);
  });
  it('offers the view that the native platform actually ships', () => {
    const native = vlcBackendFor(Plane);
    expect(native.getVlcPlane()).toBe(Plane);
    expect(native.vlcAvailable()).toBe(true);
    expect(Object.isFrozen(native)).toBe(true);
  });
  it('keeps views and release callbacks independent between shell adapters', () => {
    const releaseA = vi.fn();
    const releaseB = vi.fn();
    const a = vlcBackendFor(Plane, releaseA);
    const b = vlcBackendFor(null, releaseB);
    b.releaseVlcPlanes();
    expect(releaseB).toHaveBeenCalledOnce();
    expect(releaseA).not.toHaveBeenCalled();
    expect(a.getVlcPlane()).toBe(Plane);
    expect(b.vlcAvailable()).toBe(false);
  });
});
