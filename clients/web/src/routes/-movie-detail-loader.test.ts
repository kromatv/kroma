import { ItemId } from '@kromatv/client/media';
import { afterEach, expect, it, vi } from 'vitest';
import { createWebTestRuntime } from '#web/shared/lib/web-runtime.fixture';

vi.mock('#web/shared/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/shared/lib/api')>()),
  isAuthed: () => true,
}));

import { Route } from './_app.movies.$id';

const ID = ItemId.parse('m1');

const media = {
  similarCards: vi.fn(),
  movieCards: vi.fn(async () => []),
  artwork: { posterFor: () => '/poster', backdropFor: () => null },
};

async function load() {
  const runtime = createWebTestRuntime({ media });
  runtime.queryClient.setQueryData(runtime.queries.catalogQueries.item(ID).queryKey, {
    id: ID,
  } as never);
  const loader = Route.options.loader;
  if (typeof loader !== 'function') throw new Error('the movie route loads with a function');
  await loader({
    params: { id: ID },
    context: { runtime, queryClient: runtime.queryClient },
  } as never);
  return runtime.queryClient;
}

afterEach(() => {
  vi.clearAllMocks();
});

it('opens a title without fetching the movie list, however few its neighbours', async () => {
  media.similarCards.mockResolvedValue([{ id: 'a' }]);

  await load();

  expect(media.movieCards).not.toHaveBeenCalled();
});

it('fills the similar rail from the card view of its neighbours', async () => {
  media.similarCards.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

  const queryClient = await load();

  expect(queryClient.getQueryData(['similar', ID])).toEqual([{ id: 'a' }, { id: 'b' }]);
});

it('opens a title with an empty rail when its neighbours could not be fetched', async () => {
  media.similarCards.mockRejectedValue(new Error('offline'));

  const queryClient = await load();

  expect(queryClient.getQueryData(['similar', ID])).toEqual([]);
});
