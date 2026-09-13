// @vitest-environment jsdom

import type { ReleasesView } from '@kromatv/client/releases';
import { fakeClient } from '@kromatv/client/test';
import { clearPressGuard } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider, TvNavProvider } from '#tv/app/router';
import { TvReleases } from '#tv/features/releases/TvReleases';

vi.mock('#tv/app/providers/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#tv/app/providers/auth')>()),
  useAuth: () => ({ user: { id: 'u1' }, ready: true }),
}));

afterEach(() => {
  cleanup();
  clearPressGuard();
  sessionStorage.clear();
});

const POSTPLAY = {
  title: 'When a film ends, another is ready',
  body: 'The player shows the title closest to the one you just watched.',
};
const REQUESTS = {
  title: 'Request the film that is missing',
  body: 'Search the catalogue for a title the library does not have.',
};
const FIX = 'A paused film no longer starts again on its own.';

const VIEW: ReleasesView = {
  current: '0.1.39',
  unseen: null,
  releases: [
    {
      version: '0.1.39',
      date: '2026-09-13',
      action: [],
      highlights: [POSTPLAY],
      fixed: [FIX],
      owner: [],
    },
    {
      version: '0.1.38',
      action: [],
      highlights: [REQUESTS],
      fixed: [],
      owner: ['Requests land in Requests.'],
    },
  ],
};

async function openHistory() {
  const client = fakeClient({ releases: { list: vi.fn().mockResolvedValue(VIEW) } });
  render(
    onScreen(
      <TvClientProvider client={client}>
        <TvNavProvider screens={{} as never}>
          <TvReleases />
        </TvNavProvider>
      </TvClientProvider>,
    ),
  );
  await screen.findByText(POSTPLAY.body);
  clearPressGuard();
}

describe('TvReleases', () => {
  it('opens on the newest release', async () => {
    await openHistory();

    expect(screen.getByText('KROMA 0.1.39')).toBeTruthy();
  });

  it('shows the fixes once their row is picked', async () => {
    await openHistory();

    fireEvent.click(screen.getByText('Fixed'));

    expect(screen.getByText(FIX)).toBeTruthy();
  });

  it('opens another version on its first row, whichever row was picked before', async () => {
    await openHistory();
    fireEvent.click(screen.getByText('Fixed'));

    fireEvent.click(screen.getByText('0.1.38'));

    expect(screen.getByText(REQUESTS.body)).toBeTruthy();
  });
});
