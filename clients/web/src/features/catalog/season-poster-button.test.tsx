// @vitest-environment jsdom

import { ShowId } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mediaItem } from '#web/shared/lib/cast.fixture';
import type { TitleSeason } from '#web/shared/lib/title-view';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { SeasonPosterButton } from './season-poster-button.component';

const mocks = vi.hoisted(() => ({
  artwork: vi.fn(),
  user: { id: 'u1', permissions: ['library.manage'] },
}));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

vi.mock('#web/features/catalog/artwork-dialog.component', () => ({
  ArtworkDialog: { call: mocks.artwork },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.user.permissions = ['library.manage'];
});

const LABEL = 'Edit season poster';

function season(...episodes: TitleSeason['episodes']): TitleSeason {
  return {
    number: 2,
    name: null,
    poster: null,
    episodeCount: episodes.length,
    episodesAvailable: episodes.length,
    available: true,
    requested: false,
    airDate: null,
    episodes,
    missing: [],
    cast: [],
  };
}

function episode(showTitle: string | null) {
  return mediaItem({ id: 'e1', kind: 'episode', showId: 's1', showTitle, season: 2 });
}

function button(shown: TitleSeason) {
  const runtime = createWebTestRuntime({});
  const queries = new QueryClient();
  const invalidate = vi.spyOn(queries, 'invalidateQueries');
  render(
    <QueryClientProvider client={queries}>
      <WebRuntimeProvider value={runtime}>
        <I18nProvider locale="en">
          <SeasonPosterButton season={shown} />
        </I18nProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  return { runtime, invalidate };
}

it('opens the poster of the season and reloads its show once closed', async () => {
  mocks.artwork.mockResolvedValue(undefined);
  const { runtime, invalidate } = button(season(episode('The Office')));

  fireEvent.click(screen.getByRole('button', { name: LABEL }));

  expect(mocks.artwork).toHaveBeenCalledWith({
    kind: 'season',
    id: 's1:2',
    title: 'The Office · Season 2',
    roles: ['poster'],
  });
  const show = runtime.queries.catalogQueries.show(ShowId.parse('s1'));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: show.queryKey }));
});

it('names the season alone when its show has no title', () => {
  mocks.artwork.mockResolvedValue(undefined);
  button(season(episode(null)));

  fireEvent.click(screen.getByRole('button', { name: LABEL }));

  expect(mocks.artwork).toHaveBeenCalledWith(expect.objectContaining({ title: 'Season 2' }));
});

it('shows nothing for a season with no episode on disk', () => {
  button(season());

  expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
});

it('shows nothing to a person who cannot manage the library', () => {
  mocks.user.permissions = [];

  button(season(episode('The Office')));

  expect(screen.queryByRole('button', { name: LABEL })).toBeNull();
});
