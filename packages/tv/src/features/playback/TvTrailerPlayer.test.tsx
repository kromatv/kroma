// @vitest-environment jsdom

import type { TmdbKind } from '@kromatv/client/discovery';
import type { Trailer, TrailerPreparation } from '@kromatv/client/trailers';
import { fakeClient } from '@kromatv/client/test';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { act, cleanup, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { type TvNav, TvClientProvider, TvNavProvider, TvOutlet, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { fakeClipBackend } from '#tv/features/playback/player/clipBackend.fixture';
import { TvTrailerPlayer } from '#tv/features/playback/TvTrailerPlayer';

const { clearPressGuard, render } = createInputTestHost();

const SUPERMAN = 1061474;

const TRAILER: Trailer = {
  video: 'qu5n7RALVpE',
  name: 'Official Trailer',
  language: 'en',
  version: 'subtitled',
  kind: 'trailer',
  official: true,
  publishedAt: null,
};

const clips = fakeClipBackend();

function TrailerScreen() {
  return <TvTrailerPlayer backend={clips.backend} />;
}

let nav: TvNav;
function Capture() {
  const current = useNav();
  useEffect(() => {
    nav = current;
  });
  return null;
}

async function open(status: TrailerPreparation['status']) {
  const client = fakeClient({
    trailers: {
      prepare: async () => ({ status }),
      streamUrl: (kind: TmdbKind, tmdbId: number, video: string) =>
        `stream ${kind} ${tmdbId} ${video}`,
    },
  });
  render(
    onScreen(
      <TvClientProvider client={client}>
        <TvNavProvider screens={stubScreens({ trailer: TrailerScreen })}>
          <Capture />
          <TvOutlet />
        </TvNavProvider>
      </TvClientProvider>,
      { remote: true },
    ),
  );
  await act(async () =>
    nav.go('trailer', { kind: 'movie', tmdbId: SUPERMAN, title: 'Superman', trailer: TRAILER }),
  );
}

async function press(key: string) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

afterEach(() => {
  cleanup();
  clearPressGuard();
  sessionStorage.clear();
  clips.built.length = 0;
});

describe('the trailer screen', () => {
  it('holds the stage while the server is still fetching the trailer', async () => {
    await open('preparing');

    expect(screen.getByText('Getting the trailer ready…')).toBeTruthy();
    expect(clips.built).toEqual([]);
  });

  it('plays the file the server prepared', async () => {
    await open('ready');

    expect(clips.built.map((clip) => clip.url)).toEqual([`stream movie ${SUPERMAN} qu5n7RALVpE`]);
  });

  it('names the title and how the trailer reaches the viewer', async () => {
    await open('ready');

    expect(screen.getAllByText('Superman').length).toBeGreaterThan(0);
    expect(screen.getByText('Trailer (subtitled)')).toBeTruthy();
  });

  it('says why the trailer cannot play, and opens nothing', async () => {
    await open('failed');

    expect(screen.getByText("This trailer can't be played right now.")).toBeTruthy();
    expect(clips.built).toEqual([]);
  });

  it('leaves for the screen it came from on Back, before the trailer is even ready', async () => {
    await open('preparing');

    await press('Escape');

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });

  it('leaves for the screen it came from on Back when the trailer cannot play', async () => {
    await open('failed');

    await press('Escape');

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });

  it('leaves for the screen it came from when the trailer runs out', async () => {
    await open('ready');

    await act(async () => clips.built[0]?.listeners.onEnded());

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });
});
