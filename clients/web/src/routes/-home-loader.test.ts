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
  showCards: vi.fn(async () => []),
  artwork: { posterFor: () => '/poster', showPosterFor: () => '/poster', backdropFor: () => null },
  streamUrl: () => '/stream',
  subtitleUrl: () => '/subtitle',
};

const fetched = vi.fn(async () => Response.json([]));

async function load() {
  const runtime = createWebTestRuntime({ media });
  const loader = Route.options.loader;
  if (typeof loader !== 'function') {
    throw new Error('the home route loads with a function');
  }
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

it('starts the home and the continue row without waiting for either', async () => {
  fetched.mockReturnValue(new Promise<Response>(() => undefined));

  const queryClient = await load();

  expect(requestedPaths()).toEqual(expect.arrayContaining(['/api/home', '/api/continue']));
  expect(queryClient.isFetching()).toBeGreaterThan(0);
});

it('names the layouts the page draws, so the server sends a hero', async () => {
  await load();

  const home = fetched.mock.calls
    .map(([input]: unknown[]) => new URL(String(input)))
    .find((url) => url.pathname === '/api/home');
  expect(home?.searchParams.get('layouts')).toBe('hero,spotlight,ranked,wide');
  expect(home?.searchParams.get('view')).toBe('card');
});

it('leaves the pick of the day and the catalogue alone: the home carries its own hero', async () => {
  await load();

  expect(media.featured).not.toHaveBeenCalled();
  expect(media.movieCards).not.toHaveBeenCalled();
  expect(media.showCards).not.toHaveBeenCalled();
});
