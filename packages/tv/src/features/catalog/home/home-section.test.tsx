// @vitest-environment jsdom
import type { CardSection } from '@kromatv/client/media';
import { fakeClient } from '@kromatv/client/test';
import { createInputTestHost, onScreen } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvClientProvider, type TvNav, TvNavProvider, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { HomeSection } from '#tv/features/catalog/home/home-section';
import { mediaCard, metadata, show } from '#tv/features/catalog/media.fixtures';

const host = createInputTestHost();

vi.mock('#tv/app/providers/watched', () => ({
  useWatched: () => ({ has: (id: string) => id === 'seen' }),
}));

const DUNE = mediaCard({
  id: 'm1',
  title: 'Dune',
  metadata: metadata({ genres: ['sci-fi'], overview: 'A duke takes a desert planet.' }),
});
const ALIEN = mediaCard({ id: 'seen', title: 'Alien' });
const SILO = show({ id: 's1', title: 'Silo', progress: 40 });

const ENTRIES: CardSection['items'] = [
  { type: 'movie', item: ALIEN },
  { type: 'show', show: SILO },
];

type Layout = CardSection['layout'];

const section = (layout: Layout, over: Partial<CardSection> = {}): CardSection => ({
  id: 'row',
  title: 'Trending now',
  layout,
  notes: {},
  items: ENTRIES,
  ...over,
});

function NavHandle({ onReady }: Readonly<{ onReady: (nav: TvNav) => void }>) {
  const nav = useNav();
  onReady(nav);
  return null;
}

function mount(drawn: CardSection) {
  const client = fakeClient({
    media: {
      artwork: {
        backdropFor: () => null,
        posterFor: (m) => `poster:${m.id}`,
        showPosterFor: (s) => `poster:${s.id}`,
      },
    },
  });
  const onHold = vi.fn();
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
          <HomeSection section={drawn} onHold={onHold} />
        </TvNavProvider>
      </TvClientProvider>,
      { remote: true },
    ),
  );
  host.clearPressGuard();
  return { nav: () => nav, onHold };
}

function key(kind: 'keydown' | 'keyup', name: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent(kind, { key: name, bubbles: true }));
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  host.clearPressGuard();
  vi.useRealTimers();
});

describe('HomeSection', () => {
  it('draws a rail as cards naming what each title is', () => {
    mount(section('rail', { notes: { s1: '2 new episodes' } }));

    expect(screen.getByRole('button', { name: 'Alien' })).toBeTruthy();
    expect(screen.getByText('Movie')).toBeTruthy();
    expect(screen.getByText('Series')).toBeTruthy();
    expect(screen.queryByText('2 new episodes')).toBeNull();
  });

  it('draws a wide section with what is new in each entry, where the server said', () => {
    mount(section('wide', { notes: { s1: '2 new episodes' } }));

    expect(screen.getByText('2 new episodes')).toBeTruthy();
    expect(screen.queryByText('Series')).toBeNull();
    expect(screen.getByText('Movie')).toBeTruthy();
  });

  it('draws a ranked section as posters wearing their place', () => {
    mount(section('ranked'));

    expect(screen.getByLabelText('Number 1').getAttribute('role')).toBe('img');
    expect(screen.getByLabelText('Number 2').getAttribute('role')).toBe('img');
    expect(screen.getByRole('button', { name: 'Alien' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Silo' })).toBeTruthy();
  });

  it('draws a spotlight as one control saying why its title was picked', () => {
    mount(
      section('spotlight', {
        title: "Don't miss",
        items: [{ type: 'movie', item: DUNE }],
        notes: { m1: 'For you · Sci-fi' },
      }),
    );

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText("Don't miss")).toBeTruthy();
    expect(screen.getByText('For you · Sci-fi')).toBeTruthy();
    expect(screen.getByText('A duke takes a desert planet.')).toBeTruthy();
  });

  it('draws nothing for a spotlight the server left empty', () => {
    mount(section('spotlight', { items: [] }));

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('draws a layout it has no shape for as a rail', () => {
    mount(section('hero'));

    expect(screen.getByRole('button', { name: 'Alien' })).toBeTruthy();
    expect(screen.getByText('Movie')).toBeTruthy();
    expect(screen.queryByLabelText('Number 1')).toBeNull();
  });

  it('says why a section is offered under its title', () => {
    mount(section('rail', { reason: 'Because you watched Arrival' }));

    expect(screen.getByText('Trending now')).toBeTruthy();
    expect(screen.getByText('Because you watched Arrival')).toBeTruthy();
  });

  it('opens a film on its own page', () => {
    const { nav } = mount(section('spotlight', { items: [{ type: 'movie', item: DUNE }] }));

    fireEvent.click(screen.getByRole('button', { name: 'Dune' }));

    expect(nav().route).toEqual({ name: 'movie', params: { item: DUNE } });
  });

  it('opens a series on its own page', () => {
    const { nav } = mount(section('ranked'));

    fireEvent.click(screen.getByRole('button', { name: 'Silo' }));

    expect(nav().route).toEqual({ name: 'show', params: { show: SILO } });
  });

  it('hands the title to the menu when OK is held on it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { onHold } = mount(section('spotlight', { items: [{ type: 'show', show: SILO }] }));

    key('keydown', 'ArrowDown');
    key('keydown', 'Enter');
    act(() => void vi.advanceTimersByTime(500));
    key('keyup', 'Enter');

    expect(onHold).toHaveBeenCalledWith({ kind: 'show', item: SILO });
  });
});
