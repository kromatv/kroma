// @vitest-environment jsdom

import type { ArtKind, ArtRole } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ArtworkDialog } from './artwork-dialog.component';

const art = vi.hoisted(() => ({
  get: vi.fn(),
  choose: vi.fn(),
  chooseLink: vi.fn(),
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

function open(kind: ArtKind, id: string, roles?: readonly ArtRole[]) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={queries}>
      <I18nProvider locale="en">
        <KitProvider config={{ entry: { physicalKeyboard: true } }}>
          <ArtworkDialog />
        </KitProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
  act(() => {
    void ArtworkDialog.call({ kind, id, title: 'Heat', roles });
  });
}

const LINK = 'https://images.example/poster.png';

async function typeLink(slot: number, address: string) {
  const toggle = (await screen.findAllByRole('button', { name: 'From a link' }))[slot];
  if (!toggle) {
    throw new Error('no link button');
  }
  inputHost.clearPressGuard();
  fireEvent.click(toggle);
  const field = await screen.findByLabelText('Image address');
  fireEvent.change(field, { target: { value: address } });
  return field;
}

function useLink() {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Use this image' }));
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

it('sends the picked picture as the poster of a season', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.choose.mockResolvedValue({ url: '/api/images/chosen-s.webp' });
  open('season', 's1:2', ['poster']);

  await waitFor(() => expect(art.get).toHaveBeenCalledWith('season', 's1:2'));
  pick(0, PICKED);

  await waitFor(() =>
    expect(art.choose).toHaveBeenCalledWith({ kind: 'season', id: 's1:2', role: 'poster' }, PICKED),
  );
  expect(screen.getAllByRole('button', { name: 'Upload a picture' })).toHaveLength(1);
});

it('sends the picked picture as the logo of the title', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.choose.mockResolvedValue({ url: '/api/images/chosen-c.webp' });
  open('show', 's1');

  await waitFor(() => expect(art.get).toHaveBeenCalledWith('show', 's1'));
  pick(2, PICKED);

  await waitFor(() =>
    expect(art.choose).toHaveBeenCalledWith({ kind: 'show', id: 's1', role: 'logo' }, PICKED),
  );
  expect(screen.getByText('Logo')).toBeTruthy();
});

it('shows only the thumbnail of an episode and sends the picked picture as its still', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null, still: null });
  art.choose.mockResolvedValue({ url: '/api/images/chosen-d.webp' });
  open('item', 'e1', ['still']);

  await waitFor(() => expect(art.get).toHaveBeenCalledWith('item', 'e1'));
  pick(0, PICKED);

  await waitFor(() =>
    expect(art.choose).toHaveBeenCalledWith({ kind: 'item', id: 'e1', role: 'still' }, PICKED),
  );
  expect(screen.getByText('Thumbnail')).toBeTruthy();
  expect(screen.queryByText('Poster')).toBeNull();
  expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
});

it('names the title once, under what it edits, beside a close button', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  open('item', 'm1');

  await waitFor(() => expect(art.get).toHaveBeenCalled());

  expect(screen.getAllByText('Heat')).toHaveLength(1);
  expect(screen.getByText('Artwork')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
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

it('sends the address typed as the poster of the title, then puts the field away', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.chooseLink.mockResolvedValue({ url: '/api/images/chosen-e.webp' });
  open('item', 'm1');

  await typeLink(0, `  ${LINK} `);
  useLink();

  await waitFor(() =>
    expect(art.chooseLink).toHaveBeenCalledWith({ kind: 'item', id: 'm1', role: 'poster' }, LINK),
  );
  await waitFor(() => expect(screen.queryByLabelText('Image address')).toBeNull());
});

it('sends the address when Enter is pressed in the field', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.chooseLink.mockResolvedValue({ url: '/api/images/chosen-f.webp' });
  open('show', 's1');

  const field = await typeLink(1, LINK);
  fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });

  await waitFor(() =>
    expect(art.chooseLink).toHaveBeenCalledWith({ kind: 'show', id: 's1', role: 'backdrop' }, LINK),
  );
});

it('keeps the address and says why when the picture cannot be fetched', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  art.chooseLink.mockRejectedValue(new Error('unreachable'));
  open('item', 'm1');

  await typeLink(0, LINK);
  useLink();

  expect(await screen.findByText('Could not update the artwork.')).toBeTruthy();
  expect(screen.getByLabelText('Image address')).toBeTruthy();
});

it('sends nothing until an address is typed', async () => {
  art.get.mockResolvedValue({ poster: null, backdrop: null });
  open('item', 'm1');

  await typeLink(0, '   ');
  useLink();

  expect(art.chooseLink).not.toHaveBeenCalled();
});
