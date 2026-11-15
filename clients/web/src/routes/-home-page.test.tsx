// @vitest-environment jsdom

import type { CardSection } from '@kromatv/client/media';
import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HeroEntry } from '#web/shared/lib/queries';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

const session = vi.hoisted(() => ({ signedIn: true }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ ready: true, user: session.signedIn ? { id: 'u1' } : null }),
}));
vi.mock('#web/features/catalog/featured-hero.component', () => ({
  Hero: ({ entry }: { entry: HeroEntry }) => (
    <p>{`hero ${entry.type === 'movie' ? entry.movie.id : entry.show.id}`}</p>
  ),
  HeroSkeleton: () => <p>hero pending</p>,
}));
vi.mock('#web/features/catalog/home/hero-carousel.component', () => ({
  HeroCarousel: ({ section }: { section: CardSection }) => (
    <p>{`carousel of ${section.items.length}`}</p>
  ),
}));
vi.mock('#web/features/catalog/continue-row.component', () => ({
  ContinueRow: () => <p>continue</p>,
}));
vi.mock('#web/features/catalog/home/home-sections.component', () => ({
  HomeSections: () => <p>sections</p>,
  SectionsSkeleton: () => <p>sections pending</p>,
}));

import { Route } from './_app.index';

const art = { posterFor: () => '/poster', showPosterFor: () => '/poster', backdropFor: () => null };

const show = (id: string) => ({
  type: 'show',
  show: {
    id,
    title: id,
    year: null,
    library: 'lib',
    video: null,
    addedAt: 't',
    seasonCount: 1,
    episodeCount: 1,
  },
});

const section = (id: string, layout: string, items: unknown[]) => ({
  id,
  title: id,
  layout,
  items,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  session.signedIn = true;
});

async function mount(
  home: unknown[] | Promise<never>,
  media: { featured?: () => Promise<unknown>; movieCards?: () => Promise<unknown> } = {},
) {
  const fetched = vi.fn(async () => Response.json(await home));
  vi.stubGlobal('fetch', fetched);
  const runtime = createWebTestRuntime({
    media: {
      showCards: async () => [],
      movieCards: async () => [],
      featured: async () => null,
      artwork: art,
      ...media,
    },
  });
  const Page = Route.options.component as ComponentType;
  await act(async () => {
    render(
      <WebRuntimeProvider value={runtime}>
        <QueryClientProvider client={runtime.queryClient}>
          <I18nProvider locale="en">
            <Page />
          </I18nProvider>
        </QueryClientProvider>
      </WebRuntimeProvider>,
    );
  });
  return fetched;
}

it('draws the continue row while the home is still on its way', async () => {
  await mount(new Promise<never>(() => undefined));

  expect(screen.getByText('hero pending')).toBeTruthy();
  expect(screen.getByText('continue')).toBeTruthy();
});

it('opens on the hero the server sent', async () => {
  await mount([section('hero', 'hero', [show('s1'), show('s2')]), section('recent', 'rail', [])]);

  expect(await screen.findByText('carousel of 2')).toBeTruthy();
  expect(await screen.findByText('sections')).toBeTruthy();
});

it('falls back to the pick of the day for a server that sends no hero', async () => {
  await mount([section('recent', 'rail', [show('s1')])], {
    featured: async () => ({ type: 'show', show: { id: 's9' } }),
  });

  expect(await screen.findByText('hero s9')).toBeTruthy();
});

it('falls back to the first movie when the server has no pick either', async () => {
  await mount([], { movieCards: async () => [{ id: 'm1' }, { id: 'm2' }] });

  expect(await screen.findByText('hero m1')).toBeTruthy();
});

it('says the library is empty when there is nothing at all to show', async () => {
  await mount([]);

  expect(await screen.findByText('Your library is empty.')).toBeTruthy();
});

it('asks for nothing of the home before somebody is signed in', async () => {
  session.signedIn = false;

  const fetched = await mount([]);

  expect(screen.getByText('hero pending')).toBeTruthy();
  expect(screen.getByText('sections pending')).toBeTruthy();
  expect(fetched).not.toHaveBeenCalled();
});
