import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

vi.mock('#web/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/shared/lib/api')>()),
  isAuthed: () => true,
}));

import { Route } from './_app.index';

const media = {
  featured: vi.fn(),
  movieCards: vi.fn(async () => []),
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

it('hands the page over before the featured pick lands', async () => {
  media.featured.mockReturnValue(new Promise(() => undefined));

  const queryClient = await load();

  expect(queryClient.getQueryData(['featured'])).toBeUndefined();
});

it('starts the featured pick and the home rails together', async () => {
  media.featured.mockReturnValue(new Promise(() => undefined));

  await load();

  expect(media.featured).toHaveBeenCalledTimes(1);
  expect(media.shows).toHaveBeenCalledTimes(1);
  expect(requestedPaths()).toEqual(expect.arrayContaining(['/api/home', '/api/continue']));
});

it('leaves the movie catalogue alone, even when the server has no pick', async () => {
  media.featured.mockResolvedValue(null);

  await load();

  expect(media.movieCards).not.toHaveBeenCalled();
});
