// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useScrollLock } from './scroll-lock';

const overflow = () => document.documentElement.style.overflow;

afterEach(() => {
  document.documentElement.style.overflow = '';
});

describe('useScrollLock', () => {
  it('locks the page behind an open overlay and gives it back on close', () => {
    document.documentElement.style.overflow = 'auto';
    const view = renderHook(() => useScrollLock(true));
    expect(overflow()).toBe('hidden');
    view.unmount();
    expect(overflow()).toBe('auto');
  });

  it('holds the lock until the LAST of two nested overlays closes', () => {
    const outer = renderHook(() => useScrollLock(true));
    const inner = renderHook(() => useScrollLock(true));
    expect(overflow()).toBe('hidden');

    inner.unmount();
    expect(overflow()).toBe('hidden');

    outer.unmount();
    expect(overflow()).toBe('');
  });

  it('takes no lock while the overlay is closed', () => {
    document.documentElement.style.overflow = 'auto';
    renderHook(() => useScrollLock(false));
    expect(overflow()).toBe('auto');
  });
});
