// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type LauncherBackend, LauncherProvider, useLauncherBackend } from './launcher';

const fake = (): LauncherBackend => ({ setContinueWatching: vi.fn(), setHomeChannel: vi.fn() });
const scope = (backend: LauncherBackend) =>
  function Provider({ children }: { children: ReactNode }) {
    return <LauncherProvider value={backend}>{children}</LauncherProvider>;
  };
afterEach(cleanup);

describe('app-owned launcher integration', () => {
  it('is absent without a host capability', () => {
    expect(renderHook(useLauncherBackend).result.current).toBeNull();
  });

  it('routes each root’s updates to its own backend, independently of teardown', () => {
    const first = fake();
    const second = fake();
    const a = renderHook(useLauncherBackend, { wrapper: scope(first) });
    const b = renderHook(useLauncherBackend, { wrapper: scope(second) });
    a.result.current?.setContinueWatching('[1]');
    b.result.current?.setHomeChannel('[2]');
    expect(first.setContinueWatching).toHaveBeenCalledWith('[1]');
    expect(first.setHomeChannel).not.toHaveBeenCalled();
    expect(second.setHomeChannel).toHaveBeenCalledWith('[2]');
    expect(second.setContinueWatching).not.toHaveBeenCalled();
    a.unmount();
    expect(b.result.current).toBe(second);
  });
});
