// @vitest-environment jsdom

import type { ReleasesView } from '@kromatv/client/releases';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => {
  const list = vi.fn<() => Promise<ReleasesView>>();
  return { route: 'home', signedIn: true, go: vi.fn(), list, client: { releases: { list } } };
});

vi.mock('#tv/app/router', () => ({
  useNav: () => ({ route: { name: app.route }, go: app.go }),
}));
vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: app.signedIn ? { id: 'u1' } : null, ready: true }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ client: app.client }),
}));

import { useWhatsNewOnLaunch } from './useWhatsNewOnLaunch';

const UNSEEN: ReleasesView = { current: '0.1.39', unseen: '0.1.39', releases: [] };
const ALL_SEEN: ReleasesView = { current: '0.1.39', unseen: null, releases: [] };

const settle = () => act(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  app.route = 'home';
  app.signedIn = true;
  app.list.mockResolvedValue(UNSEEN);
});

describe('useWhatsNewOnLaunch', () => {
  it('opens the release notes when a signed-in reader lands home with one unseen', async () => {
    renderHook(() => useWhatsNewOnLaunch());

    await waitFor(() => expect(app.go).toHaveBeenCalledWith('whatsNew'));
  });

  it('leaves the reader home when every release was already shown', async () => {
    app.list.mockResolvedValue(ALL_SEEN);

    renderHook(() => useWhatsNewOnLaunch());
    await settle();

    expect(app.go).not.toHaveBeenCalled();
  });

  it('asks the server once however often the reader comes back home', async () => {
    const { rerender } = renderHook(() => useWhatsNewOnLaunch());
    await settle();

    app.route = 'grid';
    rerender();
    app.route = 'home';
    rerender();

    expect(app.list).toHaveBeenCalledOnce();
  });

  it('keeps its one question for the first time a signed-in reader reaches home', async () => {
    app.signedIn = false;
    app.route = 'profiles';
    const { rerender } = renderHook(() => useWhatsNewOnLaunch());

    app.signedIn = true;
    app.route = 'home';
    rerender();

    await waitFor(() => expect(app.go).toHaveBeenCalledWith('whatsNew'));
  });

  it('stays on the screen the reader moved to before the server answered', async () => {
    let answer: (view: ReleasesView) => void = () => undefined;
    app.list.mockReturnValue(
      new Promise<ReleasesView>((resolve) => {
        answer = resolve;
      }),
    );
    const { rerender } = renderHook(() => useWhatsNewOnLaunch());

    app.route = 'grid';
    rerender();
    await act(async () => answer(UNSEEN));

    expect(app.go).not.toHaveBeenCalled();
  });
});
