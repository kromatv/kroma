// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  answers,
  auth,
  base,
  createEventBus,
  fetchMock,
  hasPermission,
  installHarness,
  loadRuntimeRemotes,
  locale,
  navigate,
  registry,
  sessionToken,
  t,
} from '#web/modules/host.fixture';

vi.mock('@kroma/core', () => ({ sessionToken, hasPermission }));
vi.mock('@kroma/module-sdk', () => ({ createEventBus }));
vi.mock('@kroma/ui', () => ({
  useT: () => t,
  useLocale: () => locale.value,
}));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('#web/modules/registry', () => ({ moduleRegistry: registry }));
vi.mock('#web/modules/remotes', () => ({ loadRuntimeRemotes }));
vi.mock('#web/shared/lib/api', () => ({ apiBase: () => 'https://kroma.test' }));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));

import { useModuleHost } from './host';

installHarness();

describe('before there is a session', () => {
  it('wires nothing', async () => {
    auth.user = null;
    const { result } = renderHook(() => useModuleHost());
    await Promise.resolve();
    expect(registry.start).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('wires as soon as one appears', async () => {
    auth.user = null;
    const { result, rerender } = renderHook(() => useModuleHost());
    expect(result.current).toBeNull();

    auth.user = { id: 'u1' };
    rerender();
    await waitFor(() => expect(result.current).not.toBeNull());
  });
});

describe('starting the modules', () => {
  it('pulls the runtime-loaded ones in FIRST', async () => {
    const order: string[] = [];
    loadRuntimeRemotes.mockImplementation(async () => {
      order.push('remotes');
    });
    registry.start.mockImplementation(async (b: unknown) => {
      order.push('start');
      return { ...(b as object), getModuleApi: () => undefined };
    });
    renderHook(() => useModuleHost());
    await waitFor(() => expect(order).toContain('start'));
    expect(order).toEqual(['remotes', 'start']);
  });

  it('skips a module the operator has switched off', async () => {
    answers([
      { id: 'torrents', enabled: false },
      { id: 'vpn', enabled: true },
    ]);
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    const skip = registry.start.mock.calls.at(-1)?.[1] as Set<string>;
    expect(skip.has('torrents')).toBe(true);
    expect(skip.has('vpn')).toBe(false);
  });

  it('sets up EVERYTHING when the enabled state cannot be fetched', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    expect(registry.start.mock.calls.at(-1)?.[1]).toBeUndefined();
  });

  it('renders with a no-op module API when starting fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    registry.start.mockRejectedValue(new Error('federation blew up'));
    const { result } = renderHook(() => useModuleHost());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.getModuleApi('torrents' as never)).toBeUndefined();
  });

  it('re-wires when a module is installed or enabled', async () => {
    const { rerender } = renderHook(({ revision }) => useModuleHost(revision), {
      initialProps: { revision: 0 },
    });
    await waitFor(() => expect(registry.start).toHaveBeenCalledOnce());

    rerender({ revision: 1 });
    await waitFor(() => expect(registry.start).toHaveBeenCalledTimes(2));
  });

  it('does not re-wire on an ordinary re-render', async () => {
    const { rerender } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalledOnce());
    rerender();
    rerender();
    expect(registry.start).toHaveBeenCalledOnce();
  });

  it('does not set the host after the page is gone', async () => {
    type Started = Awaited<ReturnType<typeof registry.start>>;
    const finish: { fire: ((host: Started) => void) | null } = { fire: null };
    registry.start.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.fire = resolve;
        }),
    );
    const { result, unmount } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    unmount();
    finish.fire?.({ getModuleApi: () => undefined });
    await Promise.resolve();
    expect(result.current).toBeNull();
  });

  it('does not fall back to a no-op host after the page is gone', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const finish: { fail: ((e: unknown) => void) | null } = { fail: null };
    registry.start.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          finish.fail = reject;
        }),
    );
    const { result, unmount } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());

    unmount();
    finish.fail?.(new Error('federation blew up'));
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});

describe('the event bus', () => {
  it('is ONE bus for the whole app', async () => {
    const { unmount } = renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalled());
    const first = base().bus;

    unmount();
    renderHook(() => useModuleHost());
    await waitFor(() => expect(registry.start).toHaveBeenCalledTimes(2));
    expect(base().bus).toBe(first);
    expect(createEventBus).not.toHaveBeenCalled();
  });
});
