// @vitest-environment jsdom

import type { CardSection, ContinueItem, MediaCard, SectionItem } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider, type TvNav, TvNavProvider, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { mediaCard, mediaItem } from '#tv/features/catalog/media.fixtures';
import { TvHome } from '#tv/features/catalog/tv-home.component';

const host = createInputTestHost();

const home = vi.hoisted(
  (): {
    sections: CardSection[];
    featured: SectionItem | null;
    movies: MediaCard[];
    resuming: ContinueItem[];
    refresh: () => undefined;
  } => ({
    sections: [],
    featured: null,
    movies: [],
    resuming: [],
    refresh: () => undefined,
  }),
);

vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ movies: home.movies }),
}));
vi.mock('#tv/app/providers/continue', () => ({
  useContinue: () => ({ items: home.resuming, refresh: home.refresh }),
}));
vi.mock('#tv/app/providers/mylist', () => ({
  useMyList: () => ({ refresh: home.refresh }),
}));
vi.mock('#tv/app/providers/recommend', () => ({
  useRecommend: () => ({ sections: home.sections, featured: home.featured }),
}));
vi.mock('#tv/app/providers/watched', () => ({
  useWatched: () => ({ has: () => false, refresh: home.refresh }),
}));
vi.mock('#tv/app/use-root-back.hook', () => ({ useRootBack: () => undefined }));

const film = (id: string, title: string) => mediaCard({ id, title });

const DUNE = film('m1', 'Dune');

const section = (id: string, over: Partial<CardSection> = {}): CardSection => ({
  id,
  title: `Row ${id}`,
  layout: 'rail',
  notes: {},
  items: [{ type: 'movie', item: film(`${id}-1`, `Film ${id}`) }],
  ...over,
});

const hero = (...items: MediaCard[]) =>
  section('hero', { layout: 'hero', items: items.map((item) => ({ type: 'movie', item })) });

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

function mount() {
  const item = vi.fn(async (id: string) => mediaItem({ id, title: 'Dune' }));
  const client = fakeClient({
    media: {
      item,
      artwork: {
        backdropFor: () => null,
        posterFor: (m) => `poster:${m.id}`,
        showPosterFor: (s) => `poster:${s.id}`,
      },
    },
  });
  let nav!: TvNav;
  host.render(
    onScreen(
      <TvClientProvider client={client}>
        <TvNavProvider screens={stubScreens()}>
          <NavHandle
            onReady={(n) => {
              nav = n;
            }}
          />
          <TvHome />
        </TvNavProvider>
      </TvClientProvider>,
      { remote: true },
    ),
  );
  host.clearPressGuard();
  return { nav: () => nav, item };
}

async function press(key: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

const comesBefore = (first: string, second: string) =>
  screen.getByText(first).compareDocumentPosition(screen.getByText(second)) ===
  Node.DOCUMENT_POSITION_FOLLOWING;

beforeEach(() => {
  sessionStorage.clear();
  home.sections = [];
  home.featured = null;
  home.movies = [];
  home.resuming = [];
});

afterEach(() => {
  cleanup();
  host.clearPressGuard();
});

describe('TvHome', () => {
  it('opens on the hero section and draws the other sections as rows under it', () => {
    home.sections = [hero(DUNE), section('a'), section('b')];
    mount();

    expect(screen.getByLabelText('Play')).toBeTruthy();
    expect(screen.queryByText('Row hero')).toBeNull();
    expect(comesBefore('Dune', 'Row a')).toBe(true);
    expect(comesBefore('Row a', 'Row b')).toBe(true);
  });

  it('leaves a hero title in the rows the server put it in', () => {
    home.sections = [hero(DUNE), section('a', { items: [{ type: 'movie', item: DUNE }] })];
    mount();

    expect(screen.getByRole('button', { name: 'Dune' })).toBeTruthy();
  });

  it('keeps continue watching right under the hero, ahead of the server rows', () => {
    const resumed = mediaItem({ id: 'e1', title: 'Pilot' });
    home.resuming = [
      { item: resumed, positionMs: 30, durationMs: 60, updatedAt: '' } satisfies ContinueItem,
    ];
    home.sections = [hero(DUNE), section('a')];
    mount();

    expect(comesBefore('Continue watching', 'Row a')).toBe(true);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('50');
  });

  it('resumes a title from continue watching in the player', () => {
    const resumed = mediaItem({ id: 'e1', title: 'Pilot' });
    home.resuming = [{ item: resumed, positionMs: 30, durationMs: null, updatedAt: '' }];
    const { nav } = mount();

    fireEvent.click(screen.getByRole('button', { name: 'Pilot' }));

    expect(nav().route).toEqual({ name: 'player', params: { item: resumed } });
  });

  it('draws no row for a section the server left empty', () => {
    home.sections = [hero(DUNE), section('a', { items: [] }), section('b')];
    mount();

    expect(screen.queryByText('Row a')).toBeNull();
    expect(screen.getByText('Row b')).toBeTruthy();
  });

  it('mounts the rows below the fold only once the focus comes down to them', async () => {
    home.sections = [hero(DUNE), ...['a', 'b', 'c', 'd', 'e'].map((id) => section(id))];
    mount();
    const early = screen.queryByText('Row d');

    await press('ArrowDown');
    await press('ArrowDown');

    expect(early).toBeNull();
    expect(screen.getByText('Row d')).toBeTruthy();
  });

  it('plays the hero film after fetching what the card does not carry', async () => {
    home.sections = [hero(DUNE)];
    const { nav, item } = mount();

    await act(async () => void fireEvent.click(screen.getByLabelText('Play')));

    expect(item).toHaveBeenCalledWith('m1');
    expect(nav().route.name).toBe('player');
  });

  it('opens the hero title on its own page from More info', () => {
    home.sections = [hero(DUNE)];
    const { nav } = mount();

    fireEvent.click(screen.getByLabelText('More info'));

    expect(nav().route).toEqual({ name: 'movie', params: { item: DUNE } });
  });

  it('opens on the first catalogue movie while the server has sent nothing yet', () => {
    home.movies = [DUNE];
    mount();

    expect(screen.getByText('Dune')).toBeTruthy();
    expect(screen.getByText('Featured')).toBeTruthy();
  });
});
