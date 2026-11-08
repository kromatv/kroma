// @vitest-environment jsdom

import type { Trailer, TrailerList, TrailerVersion } from '@kromatv/client/trailers';
import { fakeClient } from '@kromatv/client/test';
import { FocusRegion, Focusable } from '@kromatv/ui/kit';
import { createInputTestHost, onScreen, wearsRing } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider, TvNavProvider, TvOutlet, useParams } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { LeadActions, TrailerButton } from '#tv/features/catalog/detail/TrailerButton';

const { clearPressGuard, render } = createInputTestHost();

const SUPERMAN = 1061474;

const trailerOf = (version: TrailerVersion): Trailer => ({
  video: 'qu5n7RALVpE',
  name: 'Official Trailer',
  language: 'en',
  version,
  kind: 'trailer',
  official: true,
  publishedAt: null,
});

const listing = (playable: boolean, trailers: Trailer[]): TrailerList => ({ playable, trailers });

function TrailerScreen() {
  const { title, trailer } = useParams('trailer');
  return <div>{`playing ${title} ${trailer.video}`}</div>;
}

function mount(list: () => Promise<TrailerList>, ui: ReactElement, remote = false) {
  const asked = vi.fn(list);
  render(
    onScreen(
      <TvClientProvider client={fakeClient({ trailers: { list: asked } })}>
        <TvNavProvider screens={stubScreens({ trailer: TrailerScreen })}>
          {ui}
          <TvOutlet />
        </TvNavProvider>
      </TvClientProvider>,
      { remote },
    ),
  );
  return asked;
}

const button = (tmdbId: number | null = SUPERMAN) => (
  <TrailerButton kind="movie" tmdbId={tmdbId} title="Superman" />
);

async function settle() {
  await act(async () => undefined);
}

async function press(key: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

afterEach(() => {
  cleanup();
  clearPressGuard();
  sessionStorage.clear();
});

describe('the trailer button', () => {
  it('stays hidden while the server cannot play the trailers it lists', async () => {
    mount(async () => listing(false, [trailerOf('localized')]), button());

    await settle();

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the title has no trailer', async () => {
    mount(async () => listing(true, []), button());

    await settle();

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays hidden when the trailers cannot be read', async () => {
    mount(() => Promise.reject(new Error('offline')), button());

    await settle();

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('never asks for the trailers of a title with no TMDB id', async () => {
    const asked = mount(async () => listing(true, [trailerOf('localized')]), button(null));

    await settle();

    expect(asked).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks for the trailers under the kind and id it was given', async () => {
    const asked = mount(async () => listing(true, [trailerOf('localized')]), button());

    await settle();

    expect(asked).toHaveBeenCalledWith('movie', SUPERMAN);
  });

  it('says so when the trailer it plays is subtitled', async () => {
    mount(async () => listing(true, [trailerOf('subtitled')]), button());

    expect(await screen.findByRole('button', { name: 'Trailer (subtitled)' })).toBeTruthy();
  });

  it('opens the trailer screen on the trailer it found', async () => {
    mount(async () => listing(true, [trailerOf('localized')]), button());

    fireEvent.click(await screen.findByRole('button', { name: 'Trailer' }));

    expect(screen.getByText('playing Superman qu5n7RALVpE')).toBeTruthy();
  });
});

describe('the lead actions', () => {
  it('reach the trailer right after the primary, however late the trailer arrives', async () => {
    let answer: (list: TrailerList) => void = () => undefined;
    const late = new Promise<TrailerList>((resolve) => {
      answer = resolve;
    });
    mount(
      () => late,
      <FocusRegion>
        <LeadActions trailer={{ kind: 'movie', tmdbId: SUPERMAN, title: 'Superman' }}>
          <Focusable label="Play" autoFocus />
        </LeadActions>
        <Focusable label="My list" />
      </FocusRegion>,
      true,
    );
    await act(async () => answer(listing(true, [trailerOf('localized')])));

    await press('ArrowRight');

    expect(wearsRing(screen.getByRole('button', { name: 'Trailer' }))).toBe(true);
  });
});
