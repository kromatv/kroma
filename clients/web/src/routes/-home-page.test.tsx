// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { HeroEntry } from '#web/shared/lib/queries';
import { WebRuntimeProvider } from '#web/shared/lib/web-runtime';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

vi.mock('#web/features/catalog/featured-hero', () => ({
  Hero: ({ entry }: { entry: HeroEntry }) => (
    <p>{`hero ${entry.type === 'movie' ? entry.movie.id : entry.show.id}`}</p>
  ),
  HeroSkeleton: () => <p>hero pending</p>,
}));
vi.mock('#web/features/catalog/continue-row', () => ({ ContinueRow: () => <p>continue</p> }));
vi.mock('#web/features/catalog/home-sections', () => ({
  HomeSections: ({ excludeId }: { excludeId: string | null }) => (
    <p>{`sections without ${excludeId}`}</p>
  ),
  SectionsSkeleton: () => <p>sections pending</p>,
}));
vi.mock('#web/features/catalog/cards', () => ({ ShowRail: () => <p>shows</p> }));

import { Route } from './_app.index';

const art = { posterFor: () => '/poster', showPosterFor: () => '/poster', backdropFor: () => null };

afterEach(cleanup);

async function mount(media: {
  featured: () => Promise<unknown>;
  movieCards?: () => Promise<unknown>;
}) {
  const runtime = createWebTestRuntime({
    media: { showCards: async () => [], movieCards: async () => [], artwork: art, ...media },
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
}

it('draws the rails while the featured pick is still on its way', async () => {
  await mount({ featured: () => new Promise(() => undefined) });

  expect(screen.getByText('hero pending')).toBeTruthy();
  expect(screen.getByText('continue')).toBeTruthy();
});

it('spotlights the featured pick and keeps it out of the rails', async () => {
  await mount({ featured: async () => ({ type: 'show', show: { id: 's1' } }) });

  expect(await screen.findByText('hero s1')).toBeTruthy();
  expect(await screen.findByText('sections without s1')).toBeTruthy();
});

it('falls back to the first movie when the server has no pick', async () => {
  await mount({ featured: async () => null, movieCards: async () => [{ id: 'm1' }, { id: 'm2' }] });

  expect(await screen.findByText('hero m1')).toBeTruthy();
  expect(await screen.findByText('sections without m1')).toBeTruthy();
});

it('says the library is empty when there is nothing at all to show', async () => {
  await mount({ featured: async () => null });

  expect(await screen.findByText('Your library is empty.')).toBeTruthy();
});
