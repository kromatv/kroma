// @vitest-environment jsdom
import { Focusable } from '@kromatv/ui/kit';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useBack } from '#web/shared/lib/use-back.hook';

afterEach(cleanup);

function Detail() {
  const back = useBack('/movies');
  return <Focusable label="Back" onPress={back} />;
}

async function stage(entry: string) {
  const root = createRootRoute();
  const page = (path: string) => createRoute({ getParentRoute: () => root, path });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/movies/$id',
    component: Detail,
  });
  const router = createRouter({
    routeTree: root.addChildren([page('/'), page('/movies'), page('/genres'), detail]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

describe('the Back of a page', () => {
  it('returns to the page before, with what it held', async () => {
    const router = await stage('/genres?sort=year');
    await router.navigate({ to: '/movies/$id', params: { id: 'm1' } });

    fireEvent.click(await screen.findByLabelText('Back'));

    await waitFor(() => expect(router.state.location.href).toBe('/genres?sort=year'));
  });

  it('takes the place of a page opened directly with its fallback', async () => {
    const router = await stage('/movies/m1');

    fireEvent.click(await screen.findByLabelText('Back'));

    await waitFor(() => expect(router.state.location.pathname).toBe('/movies'));
    expect(router.history.canGoBack()).toBe(false);
  });
});
