// @vitest-environment jsdom
import { Focusable } from '@kroma/ui/kit';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouteLink } from '#web/shared/ui/route-link';

afterEach(cleanup);

function Nav() {
  return <Focusable label="Genres" as={<RouteLink to="/genres" />} />;
}

async function stage() {
  const root = createRootRoute();
  const home = createRoute({ getParentRoute: () => root, path: '/', component: Nav });
  const genres = createRoute({ getParentRoute: () => root, path: '/genres', component: Nav });
  const router = createRouter({
    routeTree: root.addChildren([home, genres]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}

const link = () => screen.getByLabelText('Genres');

const MODIFIED = [
  { input: 'cmd', init: { metaKey: true } },
  { input: 'ctrl', init: { ctrlKey: true } },
  { input: 'shift', init: { shiftKey: true } },
  { input: 'middle', init: { button: 1 } },
];

describe('a route delegated to a Focusable', () => {
  it('gives the control the anchor and the href the router built', async () => {
    await stage();

    expect(link().tagName).toBe('A');
    expect(link().getAttribute('href')).toBe('/genres');
  });

  it('navigates once on a plain click, and no document loads', async () => {
    const router = await stage();
    const navigate = vi.spyOn(router, 'navigate');

    const notPrevented = fireEvent.click(link(), { button: 0 });

    await waitFor(() => expect(router.state.location.pathname).toBe('/genres'));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it.each(MODIFIED)('leaves a $input click to the browser', async ({ init }) => {
    const router = await stage();

    const notPrevented = fireEvent.click(link(), init);

    expect(router.state.location.pathname).toBe('/');
    expect(notPrevented).toBe(true);
  });
});
