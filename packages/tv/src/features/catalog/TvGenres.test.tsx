// @vitest-environment jsdom

import type { MediaItem } from '@kroma/client/media';
import { fakeClient } from '@kroma/client/test';
import { clearPressGuard } from '@kroma/ui/kit';
import { layout, onScreen } from '@kroma/ui/testing';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Connection, ConnectionProvider } from '#tv/app/providers/connection';
import {
  TvClientProvider,
  type TvNav,
  TvNavProvider,
  type TvScreens,
  useNav,
} from '#tv/app/router';
import { TvGenres } from '#tv/features/catalog/TvGenres';

const movie = (id: string, title: string, genre: string): MediaItem =>
  ({
    id,
    title,
    year: null,
    addedAt: '',
    video: null,
    metadata: { genres: [genre] },
  }) as unknown as MediaItem;

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

// jsdom has no ResizeObserver: the grid paints no cells until it is handed a box.
function measure(container: HTMLElement) {
  for (const box of [...container.querySelectorAll<HTMLElement>('div')]) {
    const measurable = (box as { __reactLayoutHandler?: unknown }).__reactLayoutHandler;
    if (typeof measurable === 'function') layout(box, { width: 1600, height: 900 });
  }
}

function mount(movies: MediaItem[]) {
  const client = fakeClient({ media: { artwork: { backdropFor: () => 'art:backdrop' } } });
  let nav!: TvNav;
  const { container } = render(
    onScreen(
      <ConnectionProvider value={{ movies, shows: [] } as unknown as Connection}>
        <TvClientProvider client={client}>
          <TvNavProvider screens={{} as TvScreens}>
            <NavHandle
              onReady={(n) => {
                nav = n;
              }}
            />
            <TvGenres />
          </TvNavProvider>
        </TvClientProvider>
      </ConnectionProvider>,
    ),
  );
  measure(container);
  clearPressGuard();
  return { nav: () => nav };
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  clearPressGuard();
});

describe('TvGenres', () => {
  it('lists every genre the loaded catalogue carries', () => {
    mount([
      movie('m1', 'Dune', 'Horror'),
      movie('m2', 'Arrival', 'Horror'),
      movie('m3', 'Up', 'Comedy'),
    ]);
    expect(screen.getByText('Horror')).toBeTruthy();
    expect(screen.getByText('Comedy')).toBeTruthy();
  });

  it('drills into the genre that was pressed', () => {
    const { nav } = mount([movie('m1', 'Dune', 'Horror')]);

    fireEvent.click(screen.getByText('Horror'));
    expect(nav().route).toEqual({ name: 'genre', params: { slug: 'horror' } });
  });

  it('says so when the catalogue carries none', () => {
    mount([]);
    expect(screen.getByText('No genres yet.')).toBeTruthy();
  });
});
