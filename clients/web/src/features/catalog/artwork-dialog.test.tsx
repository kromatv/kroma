// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkDialog } from './artwork-dialog.component';

const art = vi.hoisted(() => ({
  get: vi.fn(),
  choose: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      media: {
        chosenArt: art,
        artwork: { resolve: (url: string | null) => url },
      },
    },
  }),
}));

const inputHost = createInputTestHost();
const PICKED = new File(['picture'], 'poster.png', { type: 'image/png' });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SHOWN = {
  title: 'Heat',
  year: 1995,
  overview: null,
  genres: [],
  poster: '/api/images/beside-poster.webp',
  backdrop: '/api/images/beside-backdrop.webp',
};

function open(kind: 'item' | 'show', id: string) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={queries}>
      <I18nProvider locale="en">
        <ArtworkDialog />
      </I18nProvider>
    </QueryClientProvider>,
  );
  act(() => {
    void ArtworkDialog.call({ kind, id, title: 'Heat', shown: SHOWN });
  });
}

function pick(slot: number, file: File) {
  const input = document.querySelectorAll('input[type="file"]')[slot];
  if (!input) {
    throw new Error('no file input');
  }
  fireEvent.change(input, { target: { files: [file] } });
}

it('sends the picked picture as the poster of the title', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.choose.mockResolvedValue({ url: '/api/images/chosen-a.webp' });
  open('item', 'm1');

  await waitFor(() => expect(art.get).toHaveBeenCalledWith('item', 'm1'));
  pick(0, PICKED);

  await waitFor(() =>
    expect(art.choose).toHaveBeenCalledWith({ kind: 'item', id: 'm1', role: 'poster' }, PICKED),
  );
  expect(screen.queryByRole('button', { name: 'Restore the automatic picture' })).toBeNull();
});

it('restores the automatic picture only where one was chosen', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: '/api/images/chosen-b.webp' });
  art.reset.mockResolvedValue(undefined);
  open('show', 's1');

  const restore = await screen.findByRole('button', { name: 'Restore the automatic picture' });
  inputHost.clearPressGuard();
  fireEvent.click(restore);

  await waitFor(() =>
    expect(art.reset).toHaveBeenCalledWith({ kind: 'show', id: 's1', role: 'backdrop' }),
  );
  expect(screen.getAllByRole('button', { name: 'Restore the automatic picture' })).toHaveLength(1);
});

it('says why a picture was refused', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.choose.mockRejectedValue(new Error('unreadable'));
  open('item', 'm1');

  await waitFor(() => expect(art.get).toHaveBeenCalled());
  pick(1, PICKED);

  expect(await screen.findByText('Could not update the artwork.')).toBeTruthy();
});

it('shows the picture the page shows where none was uploaded, and says which is which', async () => {
  art.get.mockResolvedValue({ poster: '/api/images/chosen-a.webp', backdrop: null });
  open('item', 'm1');

  expect(await screen.findByText('Uploaded')).toBeTruthy();

  expect(screen.getAllByText('Automatic')).toHaveLength(1);
  expect(document.querySelector('img[src="/api/images/chosen-a.webp"]')).not.toBeNull();
  expect(document.querySelector('img[src="/api/images/beside-backdrop.webp"]')).not.toBeNull();
  expect(document.querySelector('img[src="/api/images/beside-poster.webp"]')).toBeNull();
});

it('names the title once and closes from its own header', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  open('item', 'm1');

  await waitFor(() => expect(art.get).toHaveBeenCalled());
  expect(screen.getAllByText('Heat')).toHaveLength(1);
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  await waitFor(() => expect(screen.queryByText('Poster')).toBeNull());
});
