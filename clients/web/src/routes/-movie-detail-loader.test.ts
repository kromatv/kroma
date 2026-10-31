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
  similar: vi.fn(),
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
}

afterEach(() => {
  vi.clearAllMocks();
});

it('opens a title with enough neighbours without fetching the movie list', async () => {
  media.similar.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

  await load();

  expect(media.movieCards).not.toHaveBeenCalled();
});

it('reaches for the movie list when the neighbours are too few to fill the rail', async () => {
  media.similar.mockResolvedValue([{ id: 'a' }]);

  await load();

  expect(media.movieCards).toHaveBeenCalledTimes(1);
});
