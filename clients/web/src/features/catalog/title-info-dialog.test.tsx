// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { KitProvider } from '@kromatv/ui/kit';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TitleInfoDialog } from './title-info-dialog.component';

const edits = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { media: { titleEdits: edits } } }),
}));

const inputHost = createInputTestHost();
const WRITTEN = {
  title: 'Heat',
  originalTitle: null,
  sortTitle: null,
  tagline: null,
  overview: null,
  year: 1995,
  released: null,
  genres: ['Crime'],
  directors: null,
  contentRating: null,
  cast: null,
  studios: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NOTHING_WRITTEN = {
  title: null,
  originalTitle: null,
  sortTitle: null,
  tagline: null,
  overview: null,
  year: null,
  released: null,
  genres: null,
  directors: null,
  contentRating: null,
  cast: null,
  studios: null,
};

const SHOWN = {
  title: 'Sehnsucht Nach Youkali',
  originalTitle: 'Sehnsucht nach Youkali',
  tagline: 'Songs for a lost paradise.',
  year: 2020,
  overview: 'A return to nature in songs and dance.',
  genres: ['Drama', 'Music'],
  directors: [{ name: 'Barbara Kusa' }, { name: 'Lotte Lenya' }],
  cast: [
    { name: 'Lotte Lenya', character: 'Jenny' },
    { name: 'Kurt Weill', character: null },
  ],
  ageRating: { label: 'TP' },
  studios: ['Kurt Weill Foundation', 'Arte'],
  poster: null,
  backdrop: null,
};

function open(kind: 'item' | 'show' | 'episode', id: string, shown?: typeof SHOWN) {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={queries}>
      <I18nProvider locale="en">
        <KitProvider config={{ entry: { physicalKeyboard: true } }}>
          <TitleInfoDialog />
        </KitProvider>
      </I18nProvider>
    </QueryClientProvider>,
  );
  let closed: Promise<void> = Promise.resolve();
  act(() => {
    closed = TitleInfoDialog.call({ kind, id, title: 'heat.1995', shown });
  });
  return closed;
}

function type(label: string, text: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value: text } });
}

function save() {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

it('shows what was written and saves what changed', async () => {
  edits.get.mockResolvedValue(WRITTEN);
  edits.put.mockImplementation((_kind, _id, edit) => Promise.resolve(edit));
  const closed = open('item', 'm1');

  expect(await screen.findByDisplayValue('Heat')).toBeTruthy();
  type('Summary', ' A thief and a detective. ');
  type('Genres', 'Crime, Drama');
  type('Directors', ' Michael Mann , ');
  type('Release date', '1987-0x3-01');
  type('Sort title', ' Heat, the ');
  type('Original title', ' Heat ');
  type('Tagline', ' A Los Angeles crime saga ');
  type('Age rating', ' Rated R ');
  type('Studios', ' Forward Pass , ');
  save();

  await closed;
  expect(edits.get).toHaveBeenCalledWith('item', 'm1');
  expect(edits.put).toHaveBeenCalledWith('item', 'm1', {
    title: 'Heat',
    originalTitle: 'Heat',
    sortTitle: 'Heat, the',
    tagline: 'A Los Angeles crime saga',
    overview: 'A thief and a detective.',
    year: null,
    released: '1987-03-01',
    genres: ['Crime', 'Drama'],
    directors: ['Michael Mann'],
    contentRating: 'Rated R',
    cast: null,
    studios: ['Forward Pass'],
  });
});

it('names the title once, under what it edits, beside a close button', async () => {
  edits.get.mockResolvedValue(WRITTEN);
  const closed = open('show', 's1');

  await screen.findByDisplayValue('Heat');
  expect(screen.getAllByText('heat.1995')).toHaveLength(1);
  expect(screen.getByText('Info')).toBeTruthy();
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  await closed;
  expect(edits.put).not.toHaveBeenCalled();
});

it('asks an episode for its name, air date and summary, and saves them on the item', async () => {
  edits.get.mockResolvedValue({ ...WRITTEN, title: 'Pilot', year: null, genres: [] });
  edits.put.mockImplementation((_kind, _id, edit) => Promise.resolve(edit));
  const closed = open('episode', 'e1');

  expect(await screen.findByDisplayValue('Pilot')).toBeTruthy();
  expect(screen.queryByLabelText('Sort title')).toBeNull();
  expect(screen.queryByLabelText('Original title')).toBeNull();
  expect(screen.queryByLabelText('Tagline')).toBeNull();
  expect(screen.queryByLabelText('Genres')).toBeNull();
  expect(screen.queryByLabelText('Directors')).toBeNull();
  expect(screen.queryByLabelText('Age rating')).toBeNull();
  type('Air date', '2008-01-20');
  type('Summary', 'A teacher turns to crime.');
  save();

  await closed;
  expect(edits.get).toHaveBeenCalledWith('item', 'e1');
  expect(edits.put).toHaveBeenCalledWith('item', 'e1', {
    title: 'Pilot',
    originalTitle: null,
    sortTitle: null,
    tagline: null,
    overview: 'A teacher turns to crime.',
    year: null,
    released: '2008-01-20',
    genres: null,
    directors: null,
    contentRating: null,
    cast: null,
    studios: null,
  });
});

it('says why an edit was not saved and stays open', async () => {
  edits.get.mockResolvedValue(WRITTEN);
  edits.put.mockRejectedValue(new Error('refused'));
  void open('show', 's1');

  await screen.findByDisplayValue('Heat');
  save();

  expect(await screen.findByText('Could not save the info.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
});

it('says when what was written cannot be read', async () => {
  edits.get.mockRejectedValue(new Error('down'));
  void open('show', 's1');

  expect(await screen.findByText('Could not load the info.')).toBeTruthy();
});

it('shows in grey what the page shows where nothing was written', async () => {
  edits.get.mockResolvedValue(NOTHING_WRITTEN);
  void open('item', 'm1', SHOWN);

  expect(await screen.findByPlaceholderText('Sehnsucht Nach Youkali')).toBeTruthy();

  expect(screen.getByPlaceholderText('Sehnsucht nach Youkali')).toBeTruthy();
  expect(screen.getByPlaceholderText('2020')).toBeTruthy();
  expect(screen.getByPlaceholderText('Songs for a lost paradise.')).toBeTruthy();
  expect(screen.getByPlaceholderText('A return to nature in songs and dance.')).toBeTruthy();
  expect(screen.getByPlaceholderText('Drama, Music')).toBeTruthy();
  expect(screen.getByPlaceholderText('Barbara Kusa, Lotte Lenya')).toBeTruthy();
  expect(screen.getByPlaceholderText('TP')).toBeTruthy();
  expect(screen.getByPlaceholderText('Kurt Weill Foundation, Arte')).toBeTruthy();
});

it('names the title once and closes from its own header', async () => {
  edits.get.mockResolvedValue(WRITTEN);
  const closed = open('show', 's1');

  await screen.findByDisplayValue('Heat');
  expect(screen.getAllByText('heat.1995')).toHaveLength(1);
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));

  await closed;
  expect(edits.put).not.toHaveBeenCalled();
});

it('starts the cast from the one the page shows and leaves it to the provider until it changes', async () => {
  edits.get.mockResolvedValue(NOTHING_WRITTEN);
  edits.put.mockImplementation((_kind, _id, edit) => Promise.resolve(edit));
  const closed = open('item', 'm1', SHOWN);

  expect(await screen.findByDisplayValue('Jenny')).toBeTruthy();
  expect(screen.getByLabelText('Actor 2')).toHaveProperty('value', 'Kurt Weill');
  save();

  await closed;
  expect(edits.put).toHaveBeenCalledWith('item', 'm1', expect.objectContaining({ cast: null }));
});

it('writes the cast in credit order once a row changes, is added or is removed', async () => {
  edits.get.mockResolvedValue({ ...NOTHING_WRITTEN, cast: [{ name: 'Al Pacino', role: null }] });
  edits.put.mockImplementation((_kind, _id, edit) => Promise.resolve(edit));
  const closed = open('item', 'm1', SHOWN);

  await screen.findByDisplayValue('Al Pacino');
  type("Actor 1's role", ' Vincent Hanna ');
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Add an actor' }));
  type('Actor 2', 'Robert De Niro');
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Add an actor' }));
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name: 'Remove actor 3' }));
  save();

  await closed;
  expect(edits.put).toHaveBeenCalledWith(
    'item',
    'm1',
    expect.objectContaining({
      cast: [
        { name: 'Al Pacino', role: 'Vincent Hanna' },
        { name: 'Robert De Niro', role: null },
      ],
    }),
  );
});

it('asks an episode for no cast', async () => {
  edits.get.mockResolvedValue(WRITTEN);
  void open('episode', 'e1');

  await screen.findByDisplayValue('Heat');

  expect(screen.queryByText('Cast')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add an actor' })).toBeNull();
});
