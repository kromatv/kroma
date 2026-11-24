// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { mediaItem } from '#web/shared/lib/cast.fixture';
import type { TitleSeason, TitleView } from '#web/shared/lib/title-view';
import { build } from '#web/shared/lib/title-view.fixture';
import { useTitleRequest } from './use-title-request.hook';

const requests = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ client: { requests } }) }));

afterEach(() => {
  vi.clearAllMocks();
});

function season(number: number, episode = `e${number}`): TitleSeason {
  return {
    number,
    name: null,
    poster: null,
    episodeCount: 1,
    episodesAvailable: 0,
    available: false,
    requested: false,
    airDate: null,
    episodes: [mediaItem({ id: episode, kind: 'episode' })],
    missing: [],
    cast: [],
  };
}

function owned(number: number): TitleSeason {
  return { ...season(number), episodesAvailable: 1, available: true };
}

function showView(...seasons: TitleSeason[]): TitleView {
  const film = build({ source: 'movie', item: mediaItem(), similar: [], discover: null });
  return { ...film, kind: 'show', tmdbId: 9, seasons };
}

function render(initial: TitleView) {
  return renderHook((props: { initial: TitleView }) => useTitleRequest(props.initial), {
    initialProps: { initial },
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nProvider locale="en">{children}</I18nProvider>
    ),
  });
}

it('shows the view it was handed last, so a reloaded title reaches the page', () => {
  const before = showView(season(1));
  const after = showView(season(1, 'e1-with-a-thumbnail'));
  const { result, rerender } = render(before);

  rerender({ initial: after });

  expect(result.current.view).toBe(after);
});

it('keeps a season requested from the page over a reloaded view', async () => {
  requests.create.mockResolvedValue({ status: 'pending' });
  const { result, rerender } = render(showView(season(1)));

  act(() => result.current.requestSeason(1));
  await waitFor(() => expect(result.current.view.requestStatus).toBe('pending'));
  rerender({ initial: showView(season(1, 'e1-reloaded')) });

  expect(result.current.view.seasons[0]?.requested).toBe(true);
  expect(result.current.view.seasons[0]?.episodes[0]?.id).toBe('e1-reloaded');
  expect(requests.create).toHaveBeenCalledWith({
    kind: 'show',
    tmdbId: 9,
    seasons: [1],
    episodes: undefined,
  });
});

it('marks every season still missing when the whole show is asked for', async () => {
  requests.create.mockResolvedValue({ status: 'pending' });
  const { result } = render(showView(owned(1), season(2)));

  act(() => result.current.requestAllSeasons());

  await waitFor(() => expect(result.current.view.requestStatus).toBe('pending'));
  expect(result.current.view.seasons.map((one) => one.requested)).toEqual([false, true]);
  expect(requests.create).toHaveBeenCalledWith({
    kind: 'show',
    tmdbId: 9,
    seasons: null,
    episodes: undefined,
  });
});

it('asks for the episodes picked and leaves their season as it was', async () => {
  requests.create.mockResolvedValue({ status: 'pending' });
  const { result } = render(showView(season(1)));

  act(() => result.current.toggleEpisode(1, 2));
  act(() => result.current.requestSelected());

  await waitFor(() => expect(result.current.view.requestStatus).toBe('pending'));
  expect(result.current.view.seasons[0]?.requested).toBe(false);
  expect(result.current.pendingEps.size).toBe(1);
  expect(requests.create).toHaveBeenCalledWith({
    kind: 'show',
    tmdbId: 9,
    seasons: null,
    episodes: [{ season: 1, episode: 2 }],
  });
});
