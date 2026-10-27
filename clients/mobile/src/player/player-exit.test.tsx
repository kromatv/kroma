// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  item: {
    isPending: false,
    isError: true,
    error: new Error('server unavailable'),
    refetch: vi.fn(),
  },
  progress: { isPending: true },
  router: { canGoBack: vi.fn(() => true), back: vi.fn(), replace: vi.fn() },
  retry: vi.fn(),
  focused: true,
  stopped: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useRouter: () => state.router,
  useIsFocused: () => state.focused,
  useLocalSearchParams: () => ({ id: 'film' }),
  Redirect: () => null,
}));
vi.mock('expo-keep-awake', () => ({ useKeepAwake: () => undefined }));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 20, right: 0, bottom: 20, left: 44 }),
}));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string) => ({ 'player.back': 'Back', 'error.retry': 'Retry' })[key] ?? key,
}));
vi.mock('#mobile/lib/downloads', () => ({
  useDownloads: () => ({ stateFor: () => ({ status: 'none' }) }),
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({
    query: {
      media: { item: () => ({ kind: 'item' }) },
      playback: { itemProgress: () => ({ kind: 'progress' }) },
    },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ kind }: { kind: string }) => (kind === 'item' ? state.item : state.progress),
}));
vi.mock('#mobile/player/PlayerBody', () => ({
  PlayerBody: () => {
    useEffect(() => state.stopped, []);
    return <span>Active player</span>;
  },
}));

import PlayerRoute, { ErrorBoundary } from '#mobile/app/(app)/player/[id]';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('__DEV__', false);
  state.router.canGoBack.mockReturnValue(true);
  state.item.isPending = false;
  state.item.isError = true;
  state.progress.isPending = true;
  state.focused = true;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('leaving a player that cannot start', () => {
  it('offers Back and Retry after an item error even while progress is still pending', () => {
    render(<PlayerRoute />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]);
    expect(state.router.back).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.item.refetch).toHaveBeenCalledOnce();
  });

  it('keeps Back available during loading and falls back to Home on a cold deep link', () => {
    state.item.isPending = true;
    state.item.isError = false;
    state.router.canGoBack.mockReturnValue(false);
    render(<PlayerRoute />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(state.router.replace).toHaveBeenCalledWith('/');
  });

  it('provides an exit and recovery action after a render exception', () => {
    render(<ErrorBoundary error={new Error('native player failed')} retry={state.retry} />);
    expect(screen.getByText('native player failed')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[1]);
    expect(state.router.back).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.retry).toHaveBeenCalledOnce();
  });

  it('removes the native player when another route covers it and creates a fresh player on return', () => {
    state.item.isError = false;
    Object.assign(state.item, { data: { id: 'film', durationMs: 7200000 } });
    Object.assign(state.progress, { isPending: false });
    const { rerender } = render(<PlayerRoute />);
    expect(screen.getByText('Active player')).toBeTruthy();
    state.focused = false;
    rerender(<PlayerRoute />);
    expect(screen.queryByText('Active player')).toBeNull();
    expect(state.stopped).toHaveBeenCalledOnce();
    state.focused = true;
    rerender(<PlayerRoute />);
    expect(screen.getByText('Active player')).toBeTruthy();
  });
});
