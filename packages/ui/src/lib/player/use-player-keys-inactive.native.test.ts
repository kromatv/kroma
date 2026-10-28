// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import type { HWEvent } from 'react-native';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerKeysParams } from '#ui/components/organisms/player/lib/player-keys';
import type { RemoteKey } from '#ui/lib/remote-keys';

const rn = vi.hoisted(() => ({
  os: 'ios' as 'ios' | 'android',
  remote: null as ((event: HWEvent) => void) | null,
  back: null as (() => boolean) | null,
  enableTVMenuKey: vi.fn(),
  disableTVMenuKey: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return rn.os;
    },
    isTV: true,
  },
  BackHandler: {
    addEventListener: (_: string, handler: () => boolean) => {
      rn.back = handler;
      return {
        remove: () => {
          rn.back = null;
        },
      };
    },
  },
  TVEventControl: {
    enableTVMenuKey: rn.enableTVMenuKey,
    disableTVMenuKey: rn.disableTVMenuKey,
  },
  useTVEventHandler: (handler: (event: HWEvent) => void) => {
    rn.remote = handler;
  },
}));

const routeRemoteKey = vi.hoisted(() => vi.fn());
vi.mock('#ui/components/organisms/player/lib/player-keys', () => ({ routeRemoteKey }));

const host = vi.hoisted(() => ({ onKey: null as ((key: RemoteKey) => void) | null }));
vi.mock('#ui/lib/focus-remote', () => ({
  useRemoteKeys: (handle: (key: RemoteKey) => void) => {
    host.onKey = handle;
  },
}));

import { usePlayerKeys } from './use-player-keys';

const params = (active: boolean) => ({ active }) as PlayerKeysParams;

beforeEach(() => {
  rn.os = 'ios';
  rn.remote = null;
  rn.back = null;
  host.onKey = null;
  vi.clearAllMocks();
});

describe('an inactive player on a television', () => {
  it('routes nothing the remote sends', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params(false)));

    act(() => {
      rn.remote?.({ eventType: 'select', eventKeyAction: 0 } as HWEvent);
      host.onKey?.('Right');
    });

    expect(routeRemoteKey).not.toHaveBeenCalled();
    unmount();
  });

  it('leaves the Menu key unclaimed', () => {
    const { unmount } = renderHook(() => usePlayerKeys(params(false)));

    expect(rn.enableTVMenuKey).not.toHaveBeenCalled();
    unmount();
  });

  it('leaves Android Back to the screen in front', () => {
    rn.os = 'android';

    const { unmount } = renderHook(() => usePlayerKeys(params(false)));

    expect(rn.back).toBeNull();
    unmount();
  });

  it('claims Menu and routes the remote again once it is active', () => {
    const { rerender, unmount } = renderHook(({ active }) => usePlayerKeys(params(active)), {
      initialProps: { active: false },
    });

    rerender({ active: true });
    act(() => rn.remote?.({ eventType: 'select', eventKeyAction: 0 } as HWEvent));

    expect(rn.enableTVMenuKey).toHaveBeenCalledOnce();
    expect(routeRemoteKey).toHaveBeenCalledWith({ active: true }, 'Enter');
    unmount();
  });

  it('releases Menu when it goes inactive', () => {
    const { rerender, unmount } = renderHook(({ active }) => usePlayerKeys(params(active)), {
      initialProps: { active: true },
    });

    rerender({ active: false });

    expect(rn.disableTVMenuKey).toHaveBeenCalledOnce();
    unmount();
  });
});
