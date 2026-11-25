// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TitleActions } from './title-actions.component';

const seen = vi.hoisted(() => ({
  permissions: Array.of<string>(),
  reprocess: vi.fn(),
  rematch: vi.fn(),
  artwork: vi.fn(),
  info: vi.fn(),
}));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    user: { permissions: seen.permissions },
    client: { pipeline: { reprocessSubject: seen.reprocess } },
  }),
}));
vi.mock('#web/features/catalog/rematch-dialog.component', () => ({
  RematchDialog: { call: seen.rematch },
}));
vi.mock('#web/features/catalog/artwork-dialog.component', () => ({
  ArtworkDialog: { call: seen.artwork },
}));
vi.mock('#web/features/catalog/title-info-dialog.component', () => ({
  TitleInfoDialog: { call: seen.info },
}));
vi.mock('#web/shared/ui/media-info-modal.component', () => ({
  MediaInfoModal: { call: vi.fn() },
}));

const inputHost = createInputTestHost();
const SHOWN = {
  title: 'Heat',
  originalTitle: null,
  tagline: null,
  year: 1995,
  overview: null,
  genres: ['Crime'],
  poster: '/api/images/heat.webp',
  backdrop: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function show(kind: 'item' | 'show', permissions: string[], onChanged = vi.fn()) {
  seen.permissions = permissions;
  inputHost.render(
    <I18nProvider locale="en">
      <TitleActions kind={kind} id="m1" title="Heat" shown={SHOWN} onChanged={onChanged} />
    </I18nProvider>,
  );
  return onChanged;
}

function press(name: string) {
  inputHost.clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

it('offers the artwork and the match to someone who manages the library alone', () => {
  show('item', ['library.manage']);

  expect(screen.getByRole('button', { name: 'Edit artwork' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Fix the match' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reprocess' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Media details' })).toBeNull();
});

it('offers an admin the media details of a film but not of a show', () => {
  show('show', ['settings.manage']);

  expect(screen.queryByRole('button', { name: 'Media details' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Reprocess' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit artwork' })).toBeNull();
});

it('reprocesses the title and says it changed', async () => {
  seen.reprocess.mockResolvedValue(undefined);
  const onChanged = show('item', ['settings.manage']);

  press('Reprocess');

  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(seen.reprocess).toHaveBeenCalledWith('item', 'm1');
});

it('says the title changed only once a new match was applied', async () => {
  seen.rematch.mockResolvedValueOnce('dismissed').mockResolvedValueOnce('applied');
  const onChanged = show('show', ['library.manage']);

  press('Fix the match');
  await waitFor(() => expect(seen.rematch).toHaveBeenCalledTimes(1));
  expect(onChanged).not.toHaveBeenCalled();
  press('Fix the match');

  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(seen.rematch).toHaveBeenCalledWith({ kind: 'show', id: 'm1', title: 'Heat' });
});

it('opens the title to writing by hand when the person asks from the match', async () => {
  seen.rematch.mockResolvedValue('edit');
  const onChanged = show('item', ['library.manage']);

  press('Fix the match');

  await waitFor(() =>
    expect(seen.info).toHaveBeenCalledWith({ kind: 'item', id: 'm1', title: 'Heat' }),
  );
  expect(onChanged).not.toHaveBeenCalled();
});

it('opens the artwork of the title', () => {
  show('item', ['library.manage']);

  press('Edit artwork');

  expect(seen.artwork).toHaveBeenCalledWith({
    kind: 'item',
    id: 'm1',
    title: 'Heat',
    shown: SHOWN,
  });
});
