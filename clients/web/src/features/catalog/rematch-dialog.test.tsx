// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RematchDialog } from './rematch-dialog.component';

const rematch = vi.hoisted(() => ({
  candidates: vi.fn(),
  set: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { media: { rematch } } }),
}));

const inputHost = createInputTestHost();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function open() {
  const queries = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  inputHost.render(
    <QueryClientProvider client={queries}>
      <I18nProvider locale="en">
        <RematchDialog />
      </I18nProvider>
    </QueryClientProvider>,
  );
  let ended = Promise.resolve('');
  act(() => {
    ended = RematchDialog.call({ kind: 'movie', id: 'm1', title: 'Tape three' });
  });
  return ended;
}

function press(button: HTMLElement | undefined) {
  if (!button) {
    throw new Error('no button');
  }
  inputHost.clearPressGuard();
  fireEvent.click(button);
}

it('offers to write the title by hand when TMDB finds nothing', async () => {
  rematch.candidates.mockResolvedValue({
    query: 'Tape three',
    year: null,
    results: [],
    pinned: false,
  });
  const ended = open();

  press(await screen.findByRole('button', { name: 'Edit info' }));

  expect(screen.getByText('You can write its name, year and summary yourself.')).toBeTruthy();
  await expect(ended).resolves.toBe('edit');
});

it('says it was dismissed when closed', async () => {
  rematch.candidates.mockResolvedValue({
    query: 'Tape three',
    year: null,
    results: [],
    pinned: false,
  });
  const ended = open();
  await screen.findByRole('button', { name: 'Edit info' });

  press(screen.getAllByRole('button', { name: 'Close' }).at(-1));

  await expect(ended).resolves.toBe('dismissed');
});
