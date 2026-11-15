// @vitest-environment jsdom

import type { CardSection, MediaCard, Show } from '@kromatv/client/media';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type HomeEntry, planHome } from '#mobile/lib/home-sections';

const app = vi.hoisted(() => ({ push: vi.fn(), play: vi.fn() }));

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: app.push }),
  useIsFocused: () => true,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
vi.mock('@gorhom/bottom-sheet', () => ({}));
vi.mock('#mobile/lib/play', () => ({ usePlay: () => ({ play: app.play }) }));
vi.mock('#mobile/lib/i18n', () => ({
  useT: () => (key: string, vars?: Record<string, string | number>) =>
    [key, ...Object.values(vars ?? {})].join(' '),
}));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({
    media: {
      artwork: {
        backdropFor: () => null,
        posterFor: (item: { id: string }) => `/poster/${item.id}`,
        showPosterFor: (show: { id: string }) => `/poster/${show.id}`,
      },
    },
    playback: { addToList: vi.fn(), removeFromList: vi.fn() },
    query: {
      playback: { myList: () => ({ queryKey: ['myList'], queryFn: async () => [] }) },
    },
  }),
}));

const { HomeSection } = await import('./home-section');

const movie = (id: string, title: string, overview?: string): HomeEntry => ({
  type: 'movie',
  item: { id, title, metadata: overview ? { overview, genres: [] } : null } as unknown as MediaCard,
});
const show = (id: string, title: string): HomeEntry => ({
  type: 'show',
  show: { id, title, metadata: null } as unknown as Show,
});

const section = (over: Partial<CardSection> & Pick<CardSection, 'items'>): CardSection => ({
  id: 'section',
  title: 'Section',
  layout: 'rail',
  notes: {},
  ...over,
});

function draw(drawn: CardSection, filter: 'movie' | 'show' | null = null) {
  const { hero, rows } = planHome([drawn], filter);
  const row = hero ?? rows[0];
  if (!row) throw new Error('the filter left the section nothing to draw');
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <HomeSection row={row} resumable={[]} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('a home section', () => {
  it('says why it is offered under its title', () => {
    draw(
      section({
        title: 'More like Heat',
        reason: 'You watched Heat',
        items: [movie('a', 'Ronin')],
      }),
    );

    expect(screen.getByText('More like Heat')).toBeTruthy();
    expect(screen.getByText('You watched Heat')).toBeTruthy();
  });

  it('writes what is new under each title of a wide rail', () => {
    draw(
      section({
        layout: 'wide',
        items: [show('a', 'Severance'), show('b', 'Andor')],
        notes: { a: '2 new episodes' },
      }),
    );

    expect(screen.getByText('Severance')).toBeTruthy();
    expect(screen.getByText('2 new episodes')).toBeTruthy();
    expect(screen.getByText('Andor')).toBeTruthy();
  });

  it('opens the title a wide tile shows', () => {
    draw(section({ layout: 'wide', items: [show('shw_1', 'Severance')] }));

    fireEvent.click(screen.getByText('Severance'));

    expect(app.push).toHaveBeenCalledWith('/show/shw_1');
  });

  it('numbers a ranked rail by the place the server gave each title', () => {
    const trending = section({
      layout: 'ranked',
      items: [show('a', 'Andor'), movie('b', 'Heat'), movie('c', 'Ronin')],
    });

    draw(trending, 'movie');

    expect(screen.queryByRole('button', { name: /content\.rankOf 1,/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'content.rankOf 2, Heat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'content.rankOf 3, Ronin' })).toBeTruthy();
  });

  it('gives a spotlight its note and the start of its synopsis', () => {
    draw(
      section({
        layout: 'spotlight',
        items: [movie('itm_1', 'Heat', 'A crew of thieves takes one last job.')],
        notes: { itm_1: 'For you · Crime' },
      }),
    );

    fireEvent.click(screen.getByText('Heat'));

    expect(screen.getByText('For you · Crime')).toBeTruthy();
    expect(screen.getByText('A crew of thieves takes one last job.')).toBeTruthy();
    expect(app.push).toHaveBeenCalledWith('/item/itm_1');
  });

  it('pages a hero one title at a time, each under its note', () => {
    draw(
      section({
        title: 'Featured',
        layout: 'hero',
        items: [movie('a', 'Heat'), show('b', 'Andor')],
        notes: { a: 'Trending' },
      }),
    );

    expect(screen.getByText('Trending')).toBeTruthy();
    expect(screen.getByText('Featured')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'content.heroShow Heat', selected: true })).toBeTruthy();
  });

  it('draws a hero of one title without a pager', () => {
    draw(section({ layout: 'hero', items: [movie('a', 'Heat')] }));

    expect(screen.getByText('Heat')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });
});

describe('a hero left alone', () => {
  const PHONE_WIDTH = 390;
  const TURN_EVERY_MS = 8000;
  const scroll = vi.fn();
  const turns = () => scroll.mock.calls.filter(([to]) => to.behavior === 'smooth');
  const hero = section({ layout: 'hero', items: [movie('a', 'Heat'), show('b', 'Andor')] });

  const finger = (target: HTMLElement) => ({
    identifier: 0,
    target,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    force: 1,
  });
  const rest = (on: HTMLElement) =>
    fireEvent.touchStart(on, { touches: [finger(on)], changedTouches: [finger(on)] });
  const lift = (from: HTMLElement) =>
    fireEvent.touchEnd(from, { touches: [], changedTouches: [finger(from)] });

  beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scroll = scroll;
    Object.defineProperty(document.documentElement, 'clientWidth', {
      configurable: true,
      value: PHONE_WIDTH,
    });
    window.dispatchEvent(new Event('resize'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('turns to its next title', () => {
    draw(hero);

    act(() => vi.advanceTimersByTime(TURN_EVERY_MS));

    expect(turns()).toEqual([[{ top: 0, left: PHONE_WIDTH, behavior: 'smooth' }]]);
  });

  it('stays on its page while a finger rests on it', () => {
    draw(hero);

    rest(screen.getByText('Heat'));
    act(() => vi.advanceTimersByTime(TURN_EVERY_MS * 4));

    expect(turns()).toEqual([]);
  });

  it('turns again once the finger lifts', () => {
    draw(hero);
    rest(screen.getByText('Heat'));
    act(() => vi.advanceTimersByTime(TURN_EVERY_MS * 4));

    lift(screen.getByText('Heat'));
    act(() => vi.advanceTimersByTime(TURN_EVERY_MS));

    expect(turns()).toHaveLength(1);
  });

  it('marks the page a swipe lands on', () => {
    draw(hero);
    const pager = screen.getByRole('tablist').previousElementSibling as HTMLElement;

    pager.scrollLeft = PHONE_WIDTH;
    fireEvent.scroll(pager);

    expect(
      screen.getByRole('tab', { name: 'content.heroShow Andor', selected: true }),
    ).toBeTruthy();
  });

  it('turns to the page of the dot that is pressed', () => {
    draw(hero);

    fireEvent.click(screen.getByRole('tab', { name: 'content.heroShow Andor' }));

    expect(turns()).toEqual([[{ top: 0, left: PHONE_WIDTH, behavior: 'smooth' }]]);
  });
});
