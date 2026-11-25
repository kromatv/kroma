// @vitest-environment jsdom

import { ShowId } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { mediaItem } from '#web/shared/lib/cast.fixture';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';
import { EpisodeEditButtons } from './episode-edit-buttons.component';

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  artwork: vi.fn(),
  user: { id: 'u1', permissions: ['library.manage'] },
}));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ user: mocks.user }) }));

vi.mock('#web/features/catalog/title-info-dialog.component', () => ({
  TitleInfoDialog: { call: mocks.call },
}));

vi.mock('#web/features/catalog/artwork-dialog.component', () => ({
  ArtworkDialog: { call: mocks.artwork },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.user.permissions = ['library.manage'];
});

function button(showId: string | null) {
  const runtime = createWebTestRuntime({});
  const queries = new QueryClient();
  const invalidate = vi.spyOn(queries, 'invalidateQueries');
  render(
    <QueryClientProvider client={queries}>
      <WebRuntimeProvider value={runtime}>
        <I18nProvider locale="en">
          <EpisodeEditButtons
            episode={mediaItem({ id: 'e1', kind: 'episode', showId })}
            title="1. Pilot"
          />
        </I18nProvider>
      </WebRuntimeProvider>
    </QueryClientProvider>,
  );
  return { runtime, invalidate };
}

it('opens the episode to editing and reloads its show once closed', async () => {
  mocks.call.mockResolvedValue(undefined);
  const { runtime, invalidate } = button('s1');

  fireEvent.click(screen.getByRole('button', { name: 'Edit info' }));

  expect(mocks.call).toHaveBeenCalledWith({ kind: 'episode', id: 'e1', title: '1. Pilot' });
  const show = runtime.queries.catalogQueries.show(ShowId.parse('s1'));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: show.queryKey }));
});

it('opens the thumbnail of the episode and reloads its show once closed', async () => {
  mocks.artwork.mockResolvedValue(undefined);
  const { runtime, invalidate } = button('s1');

  fireEvent.click(screen.getByRole('button', { name: 'Edit thumbnail' }));

  expect(mocks.artwork).toHaveBeenCalledWith({
    kind: 'item',
    id: 'e1',
    title: '1. Pilot',
    roles: ['still'],
  });
  const show = runtime.queries.catalogQueries.show(ShowId.parse('s1'));
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: show.queryKey }));
});

it('reloads nothing for an episode that belongs to no show', async () => {
  mocks.call.mockResolvedValue(undefined);
  const { invalidate } = button(null);

  fireEvent.click(screen.getByRole('button', { name: 'Edit info' }));

  await waitFor(() => expect(mocks.call).toHaveBeenCalled());
  expect(invalidate).not.toHaveBeenCalled();
});

it('shows nothing to a person who cannot manage the library', () => {
  mocks.user.permissions = [];

  button('s1');

  expect(screen.queryByRole('button', { name: 'Edit info' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit thumbnail' })).toBeNull();
});
