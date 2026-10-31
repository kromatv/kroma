import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

vi.mock('#web/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/shared/lib/api')>()),
  isAuthed: () => true,
}));

import { Route } from './_app.index';

const media = {
  featured: vi.fn(),
  movies: vi.fn(async () => []),
  shows: vi.fn(async () => []),
  artwork: { posterFor: () => '/poster', showPosterFor: () => '/poster', backdropFor: () => null },
  streamUrl: () => '/stream',
  subtitleUrl: () => '/subtitle',
};

const fetched = vi.fn(async () => Response.json([]));

async function load() {
  const runtime = createWebTestRuntime({ media });
  const loader = Route.options.loader;
  if (typeof loader !== 'function') throw new Error('the home route loads with a function');
  await loader({ context: { runtime, queryClient: runtime.queryClient } } as never);
  return runtime.queryClient;
}

const requestedPaths = () =>
  fetched.mock.calls.map(([input]: unknown[]) => new URL(String(input)).pathname);

beforeEach(() => {
  vi.stubGlobal('fetch', fetched);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('renders a featured pick without fetching the whole movie catalogue', async () => {
  media.featured.mockResolvedValue({ type: 'show', show: { id: 'show-1' } });

  const queryClient = await load();

  expect(media.movies).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(['featured'])).toMatchObject({ type: 'show' });
});

it('starts the home rails alongside the featured pick', async () => {
  media.featured.mockResolvedValue({ type: 'show', show: { id: 'show-1' } });

  await load();

  expect(media.shows).toHaveBeenCalledTimes(1);
  expect(requestedPaths()).toEqual(expect.arrayContaining(['/api/home', '/api/continue']));
});

it('falls back to the catalogue when the server has no pick', async () => {
  media.featured.mockResolvedValue(null);

  await load();

  expect(media.movies).toHaveBeenCalledTimes(1);
  expect(media.shows).toHaveBeenCalledTimes(1);
});
