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
const WRITTEN = { title: 'Heat', overview: null, year: 1995, genres: ['Crime'] };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function open(kind: 'item' | 'show', id: string) {
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
    closed = TitleInfoDialog.call({ kind, id, title: 'heat.1995' });
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
  type('Year', '19x87');
  save();

  await closed;
  expect(edits.get).toHaveBeenCalledWith('item', 'm1');
  expect(edits.put).toHaveBeenCalledWith('item', 'm1', {
    title: 'Heat',
    overview: 'A thief and a detective.',
    year: 1987,
    genres: ['Crime', 'Drama'],
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
